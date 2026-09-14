import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { runSchedule } from '@/core/scheduler';
import { queryOne } from '@/db/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify schedule belongs to workspace
    const sched = await queryOne<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM schedules WHERE id = $1 AND workspace_id = $2`,
      [id, session.workspaceId]
    );

    if (!sched) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const result = await runSchedule(id);
    return NextResponse.json({ result }, { status: 202 });
  } catch (err: any) {
    console.error('Run schedule error:', err);
    const status = err.message?.includes('Operator plan required') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Failed to run schedule' }, { status });
  }
}
