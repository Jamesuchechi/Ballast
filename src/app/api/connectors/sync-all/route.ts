import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { getAllConnectors } from '@/connectors/registry';
import { query } from '@/db/client';
import type { SyncResult } from '@/connectors/types';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const body = await req.json().catch(() => ({}));
    const windowDays = typeof body.windowDays === 'number' ? body.windowDays : undefined;

    const allConnectors = getAllConnectors();
    const connectedConnectors: typeof allConnectors = [];

    // Find all connected connectors
    for (const def of allConnectors) {
      try {
        const health = await def.connector.health(workspaceId);
        if (health.connected && !health.requires_reconnect) {
          connectedConnectors.push(def);
        }
      } catch (err) {
        console.warn(`[API /api/connectors/sync-all] Health check failed for ${def.id}:`, err);
      }
    }

    if (connectedConnectors.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active integrations connected to sync',
        totalConnected: 0,
        totalSynced: 0,
        totalUnchanged: 0,
        results: {},
        errors: {},
      });
    }

    // Run sync across all connected connectors in parallel with isolated error handling
    const syncPromises = connectedConnectors.map(async (def) => {
      try {
        const res = await def.connector.sync({ workspaceId, windowDays });
        return {
          id: def.id,
          name: def.name,
          result: res,
          error: res.error || null,
        };
      } catch (err: any) {
        return {
          id: def.id,
          name: def.name,
          result: {
            syncedCount: 0,
            unchangedCount: 0,
            windowDays: windowDays || 90,
            durationMs: 0,
            error: err.message || 'Sync failed',
          } as SyncResult,
          error: err.message || 'Sync failed',
        };
      }
    });

    const syncOutputs = await Promise.all(syncPromises);

    let totalSynced = 0;
    let totalUnchanged = 0;
    const results: Record<string, SyncResult> = {};
    const errors: Record<string, string> = {};

    for (const out of syncOutputs) {
      results[out.id] = out.result;
      totalSynced += out.result.syncedCount || 0;
      totalUnchanged += out.result.unchangedCount || 0;
      if (out.error) {
        errors[out.id] = out.error;
      }
    }

    // Record audit entry in access_logs
    try {
      await query(
        `INSERT INTO access_logs (workspace_id, source_id, brief_id, action)
         VALUES ($1, NULL, NULL, $2)`,
        [
          workspaceId,
          `connector_sync:manual:batch: connected=${connectedConnectors.length} synced=${totalSynced} unchanged=${totalUnchanged} errors=${Object.keys(errors).length}`,
        ]
      );
    } catch (logErr) {
      console.warn(`[API /api/connectors/sync-all] Failed logging audit entry:`, logErr);
    }

    // Outbound webhook notification (Feature E11)
    try {
      const { dispatchOutboundWebhook } = await import('@/core/outboundWebhooks');
      dispatchOutboundWebhook({
        workspaceId,
        event: 'connector.synced',
        payload: {
          connector: 'batch',
          connector_name: 'All Connected Integrations',
          connected_count: connectedConnectors.length,
          synced_count: totalSynced,
          unchanged_count: totalUnchanged,
          error_count: Object.keys(errors).length,
          results,
          errors,
          synced_at: new Date().toISOString(),
        },
      }).catch((whErr) => console.warn('[Outbound Webhook Batch Sync Error]:', whErr));
    } catch (whImportErr) {
      console.warn('[Outbound Webhook Import Error]:', whImportErr);
    }


    const hasAnyError = Object.keys(errors).length > 0;
    const allFailed = hasAnyError && Object.keys(errors).length === connectedConnectors.length;

    return NextResponse.json(
      {
        success: !allFailed,
        message: `Synced ${connectedConnectors.length} integration(s): ${totalSynced} updated, ${totalUnchanged} unchanged.`,
        totalConnected: connectedConnectors.length,
        totalSynced,
        totalUnchanged,
        results,
        errors,
      },
      { status: allFailed ? 502 : 200 }
    );
  } catch (err: any) {
    console.error(`[API /api/connectors/sync-all error]:`, err);
    return NextResponse.json({ error: err.message || 'Batch sync failed' }, { status: 500 });
  }
}
