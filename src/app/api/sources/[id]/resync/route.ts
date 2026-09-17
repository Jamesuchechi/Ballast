import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';
import { getConnector } from '@/connectors/registry';
import { chunkAndEmbedText } from '@/core/embeddings';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const { id } = await params;
    const source = await queryOne<{
      id: string;
      workspace_id: string;
      connector: string;
      external_id: string;
      checksum: string;
      meta: any;
    }>(
      `SELECT id, workspace_id, connector, external_id, checksum, meta
       FROM sources
       WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const connector = getConnector(source.connector);
    let updated = false;

    if (connector) {
      try {
        const fetchedDoc = await connector.fetch(workspaceId, source.external_id);
        if (fetchedDoc.checksum !== source.checksum) {
          await query(
            `UPDATE sources
             SET checksum = $2, meta = $3::jsonb, synced_at = NOW()
             WHERE id = $1`,
            [source.id, fetchedDoc.checksum, JSON.stringify(fetchedDoc.meta || source.meta || {})]
          );
          await query(`DELETE FROM chunks WHERE source_id = $1`, [source.id]);
          await chunkAndEmbedText({
            workspaceId,
            sourceId: source.id,
            text: fetchedDoc.content,
            sourceName: fetchedDoc.meta?.subject || fetchedDoc.meta?.title || source.external_id,
          });
          updated = true;
        } else {
          await query(
            `UPDATE sources SET synced_at = NOW() WHERE id = $1`,
            [source.id]
          );
        }
      } catch (fetchErr: any) {
        return NextResponse.json(
          { error: `Failed to re-sync source from ${source.connector}: ${fetchErr.message}` },
          { status: 502 }
        );
      }
    } else {
      // Manual upload or paste source
      await query(
        `UPDATE sources SET synced_at = NOW() WHERE id = $1`,
        [source.id]
      );
    }

    // Record audit entry in access_logs
    try {
      await query(
        `INSERT INTO access_logs (workspace_id, source_id, brief_id, action)
         VALUES ($1, $2, NULL, $3)`,
        [
          workspaceId,
          source.id,
          `source_sync:manual:${source.id}: connector=${source.connector} updated=${updated}`,
        ]
      );
    } catch (logErr) {
      console.warn(`[API /api/sources/[id]/resync] Failed logging audit entry:`, logErr);
    }

    const chunkCountRes = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM chunks WHERE source_id = $1 AND workspace_id = $2`,
      [source.id, workspaceId]
    );

    return NextResponse.json({
      success: true,
      updated,
      message: updated
        ? `Source '${source.external_id}' content updated and re-embedded.`
        : `Source '${source.external_id}' is up to date.`,
      chunkCount: parseInt(chunkCountRes?.count || '0', 10),
    });
  } catch (err: any) {
    console.error(`[API /api/sources/[id]/resync error]:`, err);
    return NextResponse.json({ error: err.message || 'Source re-sync failed' }, { status: 500 });
  }
}
