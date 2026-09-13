import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { queryOne, query } from '@/db/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const { id } = await params;
    const body = await req.json();

    const current = await queryOne(
      `SELECT * FROM schedules WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    if (!current) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const updatedEnabled = typeof body.enabled === 'boolean' ? body.enabled : !current.enabled;

    const updated = await queryOne(
      `UPDATE schedules 
       SET enabled = $1
       WHERE id = $2 AND workspace_id = $3
       RETURNING *`,
      [updatedEnabled, id, workspaceId]
    );

    return NextResponse.json({ schedule: updated });
  } catch (err: any) {
    console.error('Update schedule error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const { id } = await params;

    await query(
      `DELETE FROM schedules WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete schedule error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
