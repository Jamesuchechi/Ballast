import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, signToken, COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth';
import { queryOne } from '@/db/client';

/**
 * POST /api/workspaces/switch
 * Switches the user's active session to another workspace they belong to.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { workspaceId } = body;

    if (!workspaceId || typeof workspaceId !== 'string') {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Verify membership in the target workspace
    const memberRow = await queryOne<{
      id: string;
      name: string;
      plan: string;
      role: string;
      created_at: string;
      session_version: number;
    }>(
      `SELECT 
        w.id,
        w.name,
        w.plan,
        wm.role,
        w.created_at,
        u.session_version
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 AND wm.user_id = $2`,
      [workspaceId, session.userId]
    );

    if (!memberRow) {
      return NextResponse.json(
        { error: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    // Sign new session token for the target workspace
    const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const newToken = signToken({
      userId: session.userId,
      workspaceId: memberRow.id,
      email: session.email,
      role: memberRow.role,
      sessionVersion: memberRow.session_version ?? 1,
      exp,
    });

    const response = NextResponse.json({
      success: true,
      workspace: {
        id: memberRow.id,
        name: memberRow.name,
        plan: memberRow.plan,
        role: memberRow.role,
        createdAt: memberRow.created_at,
        isCurrent: true,
      },
    });

    response.cookies.set(COOKIE_NAME, newToken, getSessionCookieOptions());
    return response;
  } catch (err: any) {
    console.error('[API POST /api/workspaces/switch error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to switch workspace' }, { status: 500 });
  }
}
