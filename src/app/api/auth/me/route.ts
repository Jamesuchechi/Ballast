import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { queryOne } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ user: null, workspace: null }, { status: 200 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ user: null, workspace: null }, { status: 200 });
    }

    const user = await queryOne(
      `SELECT id, email, name, created_at FROM users WHERE id = $1`,
      [payload.userId]
    );

    const workspace = await queryOne(
      `SELECT w.id, w.name, w.plan, wm.role, w.created_at
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE w.id = $1 AND wm.user_id = $2`,
      [payload.workspaceId, payload.userId]
    );

    return NextResponse.json({ user, workspace });
  } catch (err: any) {
    console.error('Auth /me error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
