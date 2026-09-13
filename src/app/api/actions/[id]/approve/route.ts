import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { queryOne, query } from '@/db/client';
import { executeAction, ActionRecord } from '@/core/actionExecutor';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req, true);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized or no workspace found' }, { status: 401 });
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

    // 4. Execute the action through the actionExecutor
    try {
      const executedAction = await executeAction(id);
      return NextResponse.json({
        success: true,
        action: executedAction,
        message: executedAction.type === 'email_draft'
          ? 'Email draft approved and dispatched via Gmail API'
          : 'Action approved and executed successfully',
      });
    } catch (execErr: any) {
      // Re-fetch action with populated error
      const actionWithError = await queryOne<ActionRecord>(
        `SELECT * FROM actions WHERE id = $1`,
        [id]
      );
      return NextResponse.json(
        {
          success: false,
          action: actionWithError || approvedAction,
          error: execErr.message || 'Execution failed on external provider',
        },
        { status: 502 }
      );
    }
  } catch (err: any) {
    console.error('Approve action error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
