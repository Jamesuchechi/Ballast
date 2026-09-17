import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  dismissAllNotifications,
  deleteNotification,
  deleteAllNotifications,
  getUnreadNotificationCount,
} from '@/core/notifications';

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const includeDismissed = req.nextUrl.searchParams.get('include_dismissed') === 'true';
    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get('limit') || '50', 10),
      100
    );

    const notifications = await listNotifications(workspaceId, limit, includeDismissed);
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
    const { id, all, action = 'read' } = body;

    if (action === 'dismiss') {
      if (all) {
        await dismissAllNotifications(workspaceId);
        return NextResponse.json({ success: true, message: 'All notifications dismissed' });
      }
      if (id) {
        const updated = await dismissNotification(id, workspaceId);
        if (!updated) {
          return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, notification: updated });
      }
      return NextResponse.json({ error: 'id or all:true is required' }, { status: 400 });
    }

    // Default action: 'read'
    if (all) {
      await markAllNotificationsRead(workspaceId);
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (id) {
      const updated = await markNotificationRead(id, workspaceId);
      if (!updated) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, notification: updated });
    }

    return NextResponse.json({ error: 'id or all:true is required' }, { status: 400 });
  } catch (err: any) {
    console.error('Update notification error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const id = req.nextUrl.searchParams.get('id');
    const all = req.nextUrl.searchParams.get('all') === 'true';

    if (all) {
      await deleteAllNotifications(workspaceId);
      return NextResponse.json({ success: true, message: 'All notifications cleared permanently' });
    }

    if (id) {
      await deleteNotification(id, workspaceId);
      return NextResponse.json({ success: true, message: 'Notification deleted' });
    }

    return NextResponse.json({ error: 'id or all=true query parameter is required' }, { status: 400 });
  } catch (err: any) {
    console.error('Delete notification error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export const POST = PATCH;
