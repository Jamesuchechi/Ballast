import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { queryOne } from '@/db/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const body = await req.json();
    const status = body.status || 'resolved';

    const updated = await queryOne(
      `UPDATE flags 
       SET status = $1
       WHERE id = $2 AND workspace_id = $3
       RETURNING *`,
      [status, id, workspaceId]
    );

    if (!updated) {
      return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
    }

    return NextResponse.json({ flag: updated });
  } catch (err: any) {
    console.error('Update flag error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
