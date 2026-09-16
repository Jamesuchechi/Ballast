import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const flags = await query(
      `SELECT 
         f.id,
         f.brief_id,
         f.citation_id,
         COALESCE(f.claim_text, f.note, 'Flagged claim') as claim,
         f.kind as reason,
         COALESCE(f.status, 'open') as status,
         f.note,
         f.created_at as reported_at,
         b.question as brief_question,
         c.quote as citation_quote
       FROM flags f
       LEFT JOIN briefs b ON b.id = f.brief_id
       LEFT JOIN citations c ON c.id = f.citation_id
       WHERE f.workspace_id = $1
       ORDER BY f.created_at DESC`,
      [workspaceId]
    );

    return NextResponse.json({ flags });
  } catch (err: any) {
    console.error('List flags error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const body = await req.json();
    const { brief_id, citation_id, claim_text, kind = 'unsupported', note } = body;

    if (!brief_id) {
      return NextResponse.json({ error: 'brief_id is required' }, { status: 400 });
    }

    const newFlag = await queryOne(
      `INSERT INTO flags (workspace_id, brief_id, citation_id, claim_text, kind, note, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open')
       RETURNING *`,
      [workspaceId, brief_id, citation_id || null, claim_text || null, kind, note || null]
    );

    return NextResponse.json({ flag: newFlag }, { status: 201 });
  } catch (err: any) {
    console.error('Create flag error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
