import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, signToken, COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

/**
 * GET /api/workspaces
 * Returns all workspaces the authenticated user belongs to.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await query<{
      id: string;
      name: string;
      plan: string;
      role: string;
      created_at: string;
      member_count: string;
    }>(
      `SELECT 
        w.id,
        w.name,
        w.plan,
        wm.role,
        w.created_at,
        (SELECT COUNT(*)::text FROM workspace_members WHERE workspace_id = w.id) as member_count
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY (w.id = $2) DESC, (wm.role = 'owner') DESC, w.created_at ASC`,
      [session.userId, session.workspaceId]
    );

    const workspaces = rows.map((r) => ({
      id: r.id,
      name: r.name,
      plan: r.plan,
      role: r.role,
      createdAt: r.created_at,
      memberCount: parseInt(r.member_count || '1', 10),
      isCurrent: r.id === session.workspaceId,
    }));

    return NextResponse.json({
      workspaces,
      currentWorkspaceId: session.workspaceId,
    });
  } catch (err: any) {
    console.error('[API GET /api/workspaces error]:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

/**
 * POST /api/workspaces
 * Creates a new workspace and sets the user as owner, switching active session to it.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawName = body.name || '';
    const name = typeof rawName === 'string' ? rawName.trim() : '';

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: 'Workspace name must be at least 2 characters long' },
        { status: 400 }
      );
    }

    if (name.length > 80) {
      return NextResponse.json(
        { error: 'Workspace name cannot exceed 80 characters' },
        { status: 400 }
      );
    }

    const defaultPlan = body.plan && ['free', 'pro', 'operator'].includes(body.plan)
      ? body.plan
      : process.env.DEFAULT_WORKSPACE_PLAN || 'operator';

    // 1. Create Workspace
    const createdWorkspace = await queryOne<{ id: string; name: string; plan: string; created_at: string }>(
      `INSERT INTO workspaces (name, plan) VALUES ($1, $2) RETURNING id, name, plan, created_at`,
      [name, defaultPlan]
    );

    if (!createdWorkspace) {
      throw new Error('Failed to create workspace');
    }

    // 2. Add current user as owner
    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [createdWorkspace.id, session.userId]
    );

    // 3. Re-sign session token with new active workspace
    const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const newToken = signToken({
      userId: session.userId,
      workspaceId: createdWorkspace.id,
      email: session.email,
      role: 'owner',
      sessionVersion: session.sessionVersion ?? 1,
      exp,
    });

    const response = NextResponse.json(
      {
        success: true,
        workspace: {
          id: createdWorkspace.id,
          name: createdWorkspace.name,
          plan: createdWorkspace.plan,
          role: 'owner',
          createdAt: createdWorkspace.created_at,
          memberCount: 1,
          isCurrent: true,
        },
      },
      { status: 201 }
    );

    response.cookies.set(COOKIE_NAME, newToken, getSessionCookieOptions());
    return response;
  } catch (err: any) {
    console.error('[API POST /api/workspaces error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to create workspace' }, { status: 500 });
  }
}
