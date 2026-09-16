import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { queryOne } from '@/db/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

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
