import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
} from '@/core/notifications';

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const notifications = await listNotifications(workspaceId, 50);
    const unreadCount = await getUnreadNotificationCount(workspaceId);

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (err: any) {
    console.error('List notifications error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const body = await req.json();
    const { id, all } = body;

    if (all) {
      await markAllNotificationsRead(workspaceId);
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (id) {
      await markNotificationRead(id, workspaceId);
      return NextResponse.json({ success: true, message: 'Notification marked as read' });
    }

    return NextResponse.json({ error: 'id or all:true is required' }, { status: 400 });
  } catch (err: any) {
    console.error('Update notification error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export const POST = PATCH;

