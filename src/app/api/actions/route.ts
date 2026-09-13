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
