import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { queryOne } from '@/db/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    let workspaceId: string | null = payload?.workspaceId || null;
    const userId: string | null = payload?.userId || null;

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (!defaultWs) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
      workspaceId = defaultWs.id;
    }

    const { id } = await params;

    const action = await queryOne(
      `UPDATE actions 
       SET approved_at = NOW(), approved_by = $1
       WHERE id = $2 AND workspace_id = $3
       RETURNING *`,
      [userId, id, workspaceId]
    );

    if (!action) {
      return NextResponse.json({ error: 'Action draft not found' }, { status: 404 });
    }

    return NextResponse.json({ action, message: 'Action draft approved successfully' });
  } catch (err: any) {
    console.error('Approve action error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
