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
        return NextResponse.json({ actions: [] });
      }
      workspaceId = defaultWs.id;
    }

    const actions = await query(
      `SELECT 
         a.id,
         a.brief_id,
         a.type,
         a.payload,
         a.approved_at,
         a.executed_at,
         a.error,
         a.created_at,
         b.question as brief_question
       FROM actions a
       LEFT JOIN briefs b ON b.id = a.brief_id
       WHERE a.workspace_id = $1
       ORDER BY a.created_at DESC`,
      [workspaceId]
    );

    return NextResponse.json({ actions });
  } catch (err: any) {
    console.error('List actions error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
