import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME, verifyPassword, hashPassword } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.userId || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await queryOne<{
      id: string;
      email: string;
      name: string | null;
      created_at: string;
    }>(
      `SELECT id, email, name, created_at FROM users WHERE id = $1`,
      [payload.userId]
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const member = await queryOne<{
      workspace_id: string;
      workspace_name: string;
      plan: string;
      role: string;
      workspace_created_at: string;
    }>(
      `SELECT w.id as workspace_id, w.name as workspace_name, w.plan, wm.role, w.created_at as workspace_created_at
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.workspace_id = $1 AND wm.user_id = $2`,
      [payload.workspaceId, payload.userId]
    );

    // Get quick stats
    const briefCountRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM briefs WHERE workspace_id = $1`,
      [payload.workspaceId]
    );
    const sourceCountRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM sources WHERE workspace_id = $1`,
      [payload.workspaceId]
    );
    const scheduleCountRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM schedules WHERE workspace_id = $1`,
      [payload.workspaceId]
    );

    return NextResponse.json({
      user,
      workspace: member
        ? {
            id: member.workspace_id,
            name: member.workspace_name,
            plan: member.plan,
            role: member.role,
            createdAt: member.workspace_created_at,
          }
        : null,
      stats: {
        briefsCount: parseInt(briefCountRow?.count || '0', 10),
        sourcesCount: parseInt(sourceCountRow?.count || '0', 10),
        schedulesCount: parseInt(scheduleCountRow?.count || '0', 10),
      },
    });
  } catch (err: any) {
    console.error('[API GET /api/profile error]:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.userId || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, workspaceName, currentPassword, newPassword, plan } = body;

    // 1. Update user display name if provided
    if (typeof name === 'string' && name.trim().length > 0) {
      await query(
        `UPDATE users SET name = $1 WHERE id = $2`,
        [name.trim(), payload.userId]
      );
    }

    // 2. Update workspace name and/or plan if user is owner
    if (payload.role === 'owner') {
      if (typeof workspaceName === 'string' && workspaceName.trim().length > 0) {
        await query(
          `UPDATE workspaces SET name = $1 WHERE id = $2`,
          [workspaceName.trim(), payload.workspaceId]
        );
      }
      if (typeof plan === 'string' && ['free', 'pro', 'operator'].includes(plan)) {
        await query(
          `UPDATE workspaces SET plan = $1 WHERE id = $2`,
          [plan, payload.workspaceId]
        );
      }
    } else if (workspaceName || plan) {
      return NextResponse.json(
        { error: 'Only workspace owner can update workspace settings' },
        { status: 403 }
      );
    }

    // 3. Update password if requested
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to set a new password' },
          { status: 400 }
        );
      }
      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: 'New password must be at least 6 characters' },
          { status: 400 }
        );
      }

      const userRow = await queryOne<{ password_hash: string }>(
        `SELECT password_hash FROM users WHERE id = $1`,
        [payload.userId]
      );

      if (!userRow || !verifyPassword(currentPassword, userRow.password_hash)) {
        return NextResponse.json(
          { error: 'Current password does not match' },
          { status: 400 }
        );
      }

      const newHash = hashPassword(newPassword);
      await query(
        `UPDATE users SET password_hash = $1 WHERE id = $2`,
        [newHash, payload.userId]
      );
    }

    // Return updated profile
    const updatedUser = await queryOne<{ id: string; email: string; name: string | null; created_at: string }>(
      `SELECT id, email, name, created_at FROM users WHERE id = $1`,
      [payload.userId]
    );
    const updatedWorkspace = await queryOne<{ id: string; name: string; plan: string; created_at: string }>(
      `SELECT id, name, plan, created_at FROM workspaces WHERE id = $1`,
      [payload.workspaceId]
    );

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
      workspace: updatedWorkspace,
    });
  } catch (err: any) {
    console.error('[API PUT /api/profile error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to update profile' }, { status: 500 });
  }
}
