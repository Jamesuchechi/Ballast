import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';
import { deleteSource } from '@/core/deletion';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const singleId = req.nextUrl.searchParams.get('id');
    if (singleId) {
      const source = await queryOne(
        `SELECT 
           s.id, 
           s.external_id, 
           s.connector, 
           s.checksum, 
           s.trust_boundary, 
           s.sync_window_start,
           s.synced_at,
           s.last_error,
           s.created_at, 
           s.meta,
           COALESCE(c.chunk_count, 0)::int as chunk_count
         FROM sources s
         LEFT JOIN (
           SELECT source_id, COUNT(*)::int as chunk_count
           FROM chunks
           WHERE workspace_id = $2
           GROUP BY source_id
         ) c ON c.source_id = s.id
         WHERE s.id = $1 AND s.workspace_id = $2`,
        [singleId, workspaceId]
      );

      if (!source) {
        return NextResponse.json({ error: 'Source not found' }, { status: 404 });
      }

      const chunks = await query(
        `SELECT id, ordinal, text, created_at
         FROM chunks
         WHERE source_id = $1 AND workspace_id = $2
         ORDER BY ordinal ASC
         LIMIT 100`,
        [singleId, workspaceId]
      );

      return NextResponse.json({ source, chunks });
    }

    const rows = await query(
      `SELECT 
         s.id, 
         s.external_id, 
         s.connector, 
         s.checksum, 
         s.trust_boundary, 
         s.sync_window_start,
         s.synced_at,
         s.last_error,
         s.created_at, 
         s.meta,
         COALESCE(c.chunk_count, 0)::int as chunk_count
       FROM sources s
       LEFT JOIN (
         SELECT source_id, COUNT(*)::int as chunk_count
         FROM chunks
         WHERE workspace_id = $1
         GROUP BY source_id
       ) c ON c.source_id = s.id
       WHERE s.workspace_id = $1
       ORDER BY s.created_at DESC`,
      [workspaceId]
    );

    return NextResponse.json({ sources: rows });
  } catch (err: any) {
    console.error('[API /api/sources error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to list sources' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Source ID is required' }, { status: 400 });
    }

    const result = await deleteSource(workspaceId, id);

    if (!result.success) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Source, chunks, and storage payloads deleted',
      deletedChunks: result.deletedChunks,
    });
  } catch (err: any) {
    console.error('[API DELETE /api/sources error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete source' }, { status: 500 });
  }
}
