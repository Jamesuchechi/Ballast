import { query, queryOne } from '@/db/client';

export interface NotificationRow {
  id: string;
  workspace_id: string;
  brief_id: string | null;
  type: 'brief_published' | 'brief_failed' | 'schedule_run';
  title: string;
  message: string;
  read: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export async function createNotification(params: {
  workspaceId: string;
  briefId?: string | null;
  type: 'brief_published' | 'brief_failed' | 'schedule_run';
  title: string;
  message: string;
}): Promise<NotificationRow> {
  const { workspaceId, briefId = null, type, title, message } = params;

  const row = await queryOne<NotificationRow>(
    `INSERT INTO notifications (workspace_id, brief_id, type, title, message, read, read_at, dismissed_at)
     VALUES ($1, $2, $3, $4, $5, false, null, null)
     RETURNING *`,
    [workspaceId, briefId, type, title, message]
  );

  // Email simulation/dispatch hook (FR7.2)
  console.log(`[Notification Dispatch] Workspace ${workspaceId}: [${type}] ${title} — ${message}`);

  return row!;
}

export async function listNotifications(
  workspaceId: string,
  limit: number = 50,
  includeDismissed: boolean = false
): Promise<NotificationRow[]> {
  if (includeDismissed) {
    return query<NotificationRow>(
      `SELECT * FROM notifications 
       WHERE workspace_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [workspaceId, limit]
    );
  }

  return query<NotificationRow>(
    `SELECT * FROM notifications 
     WHERE workspace_id = $1 AND dismissed_at IS NULL
     ORDER BY created_at DESC 
     LIMIT $2`,
    [workspaceId, limit]
  );
}

export async function markNotificationRead(
  id: string,
  workspaceId: string
): Promise<NotificationRow | null> {
  return queryOne<NotificationRow>(
    `UPDATE notifications 
     SET read = true, 
         read_at = COALESCE(read_at, NOW()) 
     WHERE id = $1 AND workspace_id = $2
     RETURNING *`,
    [id, workspaceId]
  );
}

export async function markAllNotificationsRead(workspaceId: string): Promise<void> {
  await query(
    `UPDATE notifications 
     SET read = true, 
         read_at = COALESCE(read_at, NOW()) 
     WHERE workspace_id = $1 AND read = false`,
    [workspaceId]
  );
}

export async function dismissNotification(
  id: string,
  workspaceId: string
): Promise<NotificationRow | null> {
  return queryOne<NotificationRow>(
    `UPDATE notifications 
     SET dismissed_at = NOW() 
     WHERE id = $1 AND workspace_id = $2
     RETURNING *`,
    [id, workspaceId]
  );
}

export async function dismissAllNotifications(workspaceId: string): Promise<void> {
  await query(
    `UPDATE notifications 
     SET dismissed_at = NOW() 
     WHERE workspace_id = $1 AND dismissed_at IS NULL`,
    [workspaceId]
  );
}

export async function deleteNotification(
  id: string,
  workspaceId: string
): Promise<void> {
  await query(
    `DELETE FROM notifications WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
}

export async function deleteAllNotifications(workspaceId: string): Promise<void> {
  await query(
    `DELETE FROM notifications WHERE workspace_id = $1`,
    [workspaceId]
  );
}

export async function getUnreadNotificationCount(workspaceId: string): Promise<number> {
  const res = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count 
     FROM notifications 
     WHERE workspace_id = $1 AND read = false AND dismissed_at IS NULL`,
    [workspaceId]
  );
  return res ? parseInt(res.count, 10) : 0;
}
