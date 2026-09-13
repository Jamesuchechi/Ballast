import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

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
           COUNT(c.id)::int as chunk_count
         FROM sources s
         LEFT JOIN chunks c ON c.source_id = s.id
         WHERE s.id = $1 AND s.workspace_id = $2
         GROUP BY s.id`,
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
         s.created_at, 
         s.meta,
         COUNT(c.id)::int as chunk_count
       FROM sources s
       LEFT JOIN chunks c ON c.source_id = s.id
       WHERE s.workspace_id = $1
       GROUP BY s.id
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
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Source ID is required' }, { status: 400 });
    }

    await query(
      `DELETE FROM sources WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    return NextResponse.json({ success: true, message: 'Source deleted' });
  } catch (err: any) {
    console.error('[API DELETE /api/sources error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete source' }, { status: 500 });
  }
}
