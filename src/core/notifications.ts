import { query, queryOne } from '@/db/client';

export interface NotificationRow {
  id: string;
  workspace_id: string;
  brief_id: string | null;
  type: 'brief_published' | 'brief_failed' | 'schedule_run';
  title: string;
  message: string;
  read: boolean;
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
    `INSERT INTO notifications (workspace_id, brief_id, type, title, message, read)
     VALUES ($1, $2, $3, $4, $5, false)
     RETURNING *`,
    [workspaceId, briefId, type, title, message]
  );

  // Email simulation/dispatch hook (FR7.2)
  console.log(`[Notification Dispatch] Workspace ${workspaceId}: [${type}] ${title} — ${message}`);

  return row!;
}

export async function listNotifications(
  workspaceId: string,
  limit: number = 20
): Promise<NotificationRow[]> {
  return query<NotificationRow>(
    `SELECT * FROM notifications 
     WHERE workspace_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [workspaceId, limit]
  );
}

export async function markNotificationRead(
  id: string,
  workspaceId: string
): Promise<void> {
  await query(
    `UPDATE notifications SET read = true WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
}

export async function markAllNotificationsRead(workspaceId: string): Promise<void> {
  await query(
    `UPDATE notifications SET read = true WHERE workspace_id = $1`,
    [workspaceId]
  );
}

export async function getUnreadNotificationCount(workspaceId: string): Promise<number> {
  const res = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM notifications WHERE workspace_id = $1 AND read = false`,
    [workspaceId]
  );
  return res ? parseInt(res.count, 10) : 0;
}

