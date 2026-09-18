import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { getConnector } from '@/connectors/registry';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const { id } = await params;
    const connector = getConnector(id);

    if (!connector) {
      return NextResponse.json({ error: `Connector '${id}' not found in registry` }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const windowDays = typeof body.windowDays === 'number' ? body.windowDays : undefined;

    const result = await connector.sync({
      workspaceId,
      windowDays,
    });

    // Record manual sync audit entry in access_logs (NFR2.4 / E3)
    try {
      const { query } = await import('@/db/client');
      await query(
        `INSERT INTO access_logs (workspace_id, source_id, brief_id, action)
         VALUES ($1, NULL, NULL, $2)`,
        [
          workspaceId,
          `connector_sync:manual:${id}: synced=${result.syncedCount} unchanged=${result.unchangedCount} duration=${result.durationMs}ms`,
        ]
      );
    } catch (logErr) {
      console.warn(`[API /api/connectors/[id]/sync] Failed recording access log:`, logErr);
    }

    // Outbound webhook notification (Feature E11)
    try {
      const { dispatchOutboundWebhook } = await import('@/core/outboundWebhooks');
      dispatchOutboundWebhook({
        workspaceId,
        event: 'connector.synced',
        payload: {
          connector: id,
          connector_name: connector.name,
          synced_count: result.syncedCount,
          unchanged_count: result.unchangedCount,
          duration_ms: result.durationMs,
          status: result.error ? 'error' : 'success',
          error: result.error || null,
          synced_at: new Date().toISOString(),
        },
      }).catch((whErr) => console.warn('[Outbound Webhook Sync Error]:', whErr));
    } catch (whImportErr) {
      console.warn('[Outbound Webhook Import Error]:', whImportErr);
    }


    if (result.error) {
      return NextResponse.json(
        {
          error: result.error,
          result,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      connectorId: id,
      message: `${connector.name} synced: ${result.syncedCount} updated, ${result.unchangedCount} unchanged in ${result.durationMs}ms`,
      result,
    });
  } catch (err: any) {
    console.error(`[API /api/connectors/[id]/sync error]:`, err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
