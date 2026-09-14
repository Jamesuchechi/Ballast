import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { queryOne, query } from '@/db/client';
import { ActionRecord } from '@/core/actionExecutor';
import { enqueueActionJob } from '@/queue/actionQueue';

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
    const workspaceId = session.workspaceId;
    const userId = session.userId;

    // 1. Fetch action with workspace plan
    const action = await queryOne<ActionRecord>(
      `SELECT a.*, w.plan
       FROM actions a
       JOIN workspaces w ON w.id = a.workspace_id
       WHERE a.id = $1 AND a.workspace_id = $2`,
      [id, workspaceId]
    );

    if (!action) {
      return NextResponse.json({ error: 'Action draft not found' }, { status: 404 });
    }

    // 2. Entitlement Gate (TODO.md Phase 5: "Free/Pro: server returns 403 on propose/execute")
    if (action.plan !== 'operator') {
      return NextResponse.json(
        {
          error: `Operator plan required to approve and execute external actions. Current workspace plan is '${action.plan || 'free'}'.`,
          code: 'operator_plan_required',
          plan: action.plan,
        },
        { status: 403 }
      );
    }

    // 3. Mark approved in DB
    const approvedAction = await queryOne<ActionRecord>(
      `UPDATE actions 
       SET approved_at = NOW(), approved_by = $1, error = NULL
       WHERE id = $2 AND workspace_id = $3
       RETURNING *`,
      [userId, id, workspaceId]
    );

    if (!approvedAction) {
      return NextResponse.json({ error: 'Failed to update action approval' }, { status: 500 });
    }

    // 4. Dispatch to BullMQ for dedicated worker execution
    await enqueueActionJob(id, workspaceId);

    return NextResponse.json({
      success: true,
      action: approvedAction,
      message: approvedAction.type === 'email_draft'
        ? 'Email draft approved and enqueued for dispatch via Gmail API'
        : 'Action approved and enqueued for execution',
    });
  } catch (err: any) {
    console.error('Approve action error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
