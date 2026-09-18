import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getAuthSession(req);

    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    const brief = await queryOne(
      `SELECT * FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [id, payload.workspaceId]
    );

    if (!brief) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    const citations = await query(
      `SELECT c.*, s.connector, s.uri, s.trust_boundary, s.mime_type
       FROM citations c
       LEFT JOIN sources s ON c.source_id = s.id
       WHERE c.brief_id = $1 
       ORDER BY c.created_at ASC`,
      [id]
    );

    const actions = await query(
      `SELECT * FROM actions WHERE brief_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    const runs = await query(
      `SELECT * FROM runs WHERE brief_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    // Version history: find parent and children
    const versions = await query(
      `SELECT id, parent_brief_id, as_of, status, template_version 
       FROM briefs 
       WHERE workspace_id = $1 AND (id = $2 OR parent_brief_id = $2 OR id = $3)
       ORDER BY as_of ASC`,
      [payload.workspaceId, id, brief.parent_brief_id || id]
    );

    let parentBrief = null;
    if (brief.parent_brief_id) {
      parentBrief = await queryOne(
        `SELECT id, question, markdown, as_of, status, template_version FROM briefs WHERE id = $1 AND workspace_id = $2`,
        [brief.parent_brief_id, payload.workspaceId]
      );
    }

    return NextResponse.json({
      brief,
      parentBrief,
      citations,
      actions,
      runs: runs.length > 0 ? runs[0] : null,
      versions,
    });
  } catch (err: any) {
    console.error('Get brief error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getAuthSession(req);

    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.starred === undefined) {
      return NextResponse.json({ error: 'Missing starred boolean value' }, { status: 400 });
    }

    const isStarred = Boolean(body.starred);

    const updated = await queryOne(
      `UPDATE briefs 
       SET starred = $1 
       WHERE id = $2 AND workspace_id = $3 
       RETURNING *`,
      [isStarred, id, payload.workspaceId]
    );

    if (!updated) {
      return NextResponse.json({ error: 'Brief not found in workspace' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      brief: updated,
    });
  } catch (err: any) {
    console.error('Update brief error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
