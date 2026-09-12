import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    let workspaceId: string | null = payload?.workspaceId || null;

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (!defaultWs) {
        return NextResponse.json({ flags: [] });
      }
      workspaceId = defaultWs.id;
    }

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
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    let workspaceId: string | null = payload?.workspaceId || null;

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (!defaultWs) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
      workspaceId = defaultWs.id;
    }

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
