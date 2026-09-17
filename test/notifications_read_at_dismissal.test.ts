import { pool, query, queryOne } from '../src/db/client';
import {
  createNotification,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  dismissAllNotifications,
  deleteNotification,
  deleteAllNotifications,
  getUnreadNotificationCount,
} from '../src/core/notifications';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
  console.log('=== Ballast M7: Notifications read_at Timestamp & Dismissal Test Suite ===\n');

  try {
    // ----------------------------------------------------
    // Test 1: Run Migration 012
    // ----------------------------------------------------
    console.log('[Test 1] Applying migration 012_add_read_at_and_dismissed_to_notifications.sql...');
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'src/db/migrations/012_add_read_at_and_dismissed_to_notifications.sql'),
      'utf8'
    );
    await pool.query(migrationSql);
    console.log('  Passed: Migration 012 applied successfully.');

    // ----------------------------------------------------
    // Test 2: Setup Workspace & Initial Notification Creation
    // ----------------------------------------------------
    console.log('\n[Test 2] Creating test notifications and verifying initial unread state...');
    const wsRes = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name, plan)
      VALUES ('M7 Notifications Test Workspace', 'operator')
      RETURNING id;
    `);
    const workspaceId = wsRes.rows[0].id;

    const notif1 = await createNotification({
      workspaceId,
      type: 'brief_published',
      title: 'Weekly Executive Brief Published',
      message: 'Brief published with 4 verified claims.',
    });

    const notif2 = await createNotification({
      workspaceId,
      type: 'schedule_run',
      title: 'Schedule Run Triggered',
      message: 'Daily Check triggered.',
    });

    const notif3 = await createNotification({
      workspaceId,
      type: 'brief_failed',
      title: 'Brief Generation Failed',
      message: 'API rate limit exceeded.',
    });

    if (notif1.read !== false || notif1.read_at !== null || notif1.dismissed_at !== null) {
      throw new Error(`Expected new notification to have read=false, read_at=null, dismissed_at=null. Got: read=${notif1.read}, read_at=${notif1.read_at}`);
    }

    const initialUnread = await getUnreadNotificationCount(workspaceId);
    if (initialUnread !== 3) {
      throw new Error(`Expected 3 unread notifications, got: ${initialUnread}`);
    }
    console.log('  Passed: Initial notifications created with read=false, read_at=null.');

    // ----------------------------------------------------
    // Test 3: Single Notification Mark Read & read_at Timestamp
    // ----------------------------------------------------
    console.log('\n[Test 3] Marking single notification as read and verifying read_at timestamp...');
    const beforeMark = Date.now();
    const updatedNotif1 = await markNotificationRead(notif1.id, workspaceId);

    if (!updatedNotif1 || !updatedNotif1.read || !updatedNotif1.read_at) {
      throw new Error(`Expected markNotificationRead to set read=true and populate read_at. Got: ${JSON.stringify(updatedNotif1)}`);
    }

    const readAtMs = new Date(updatedNotif1.read_at).getTime();
    if (readAtMs < beforeMark - 2000 || readAtMs > Date.now() + 2000) {
      throw new Error(`read_at timestamp ${updatedNotif1.read_at} outside expected time window`);
    }

    const unreadAfterSingle = await getUnreadNotificationCount(workspaceId);
    if (unreadAfterSingle !== 2) {
      throw new Error(`Expected 2 unread notifications, got: ${unreadAfterSingle}`);
    }
    console.log('  Passed: markNotificationRead sets read=true and records read_at timestamp:', updatedNotif1.read_at);

    // ----------------------------------------------------
    // Test 4: Bulk Mark All Notifications Read
    // ----------------------------------------------------
    console.log('\n[Test 4] Testing markAllNotificationsRead...');
    await markAllNotificationsRead(workspaceId);

    const activeList = await listNotifications(workspaceId, 10);
    for (const n of activeList) {
      if (!n.read || !n.read_at) {
        throw new Error(`Expected notification ${n.id} to be marked read with read_at timestamp, got read=${n.read}, read_at=${n.read_at}`);
      }
    }

    const unreadAfterAll = await getUnreadNotificationCount(workspaceId);
    if (unreadAfterAll !== 0) {
      throw new Error(`Expected 0 unread notifications after markAll, got: ${unreadAfterAll}`);
    }
    console.log('  Passed: markAllNotificationsRead updated all unread notifications with read_at timestamps.');

    // ----------------------------------------------------
    // Test 5: Single Notification Dismissal
    // ----------------------------------------------------
    console.log('\n[Test 5] Testing single notification dismissal...');
    const dismissedNotif2 = await dismissNotification(notif2.id, workspaceId);
    if (!dismissedNotif2 || !dismissedNotif2.dismissed_at) {
      throw new Error(`Expected dismissNotification to set dismissed_at timestamp`);
    }

    const activeAfterDismiss = await listNotifications(workspaceId, 10);
    if (activeAfterDismiss.some((n) => n.id === notif2.id)) {
      throw new Error(`Expected dismissed notification ${notif2.id} to be excluded from listNotifications by default`);
    }

    const allWithDismissed = await listNotifications(workspaceId, 10, true);
    if (!allWithDismissed.some((n) => n.id === notif2.id)) {
      throw new Error(`Expected dismissed notification ${notif2.id} to appear when includeDismissed=true`);
    }
    console.log('  Passed: dismissNotification set dismissed_at and filtered from active list.');

    // ----------------------------------------------------
    // Test 6: Bulk Dismiss All Notifications
    // ----------------------------------------------------
    console.log('\n[Test 6] Testing dismissAllNotifications...');
    await dismissAllNotifications(workspaceId);

    const activeAfterDismissAll = await listNotifications(workspaceId, 10);
    if (activeAfterDismissAll.length !== 0) {
      throw new Error(`Expected 0 active notifications after dismissAll, got: ${activeAfterDismissAll.length}`);
    }

    const totalInDb = await listNotifications(workspaceId, 10, true);
    if (totalInDb.length !== 3) {
      throw new Error(`Expected 3 total notifications preserved in DB with dismissed_at timestamps, got: ${totalInDb.length}`);
    }
    console.log('  Passed: dismissAllNotifications cleared active feed while preserving engagement audit history.');

    // ----------------------------------------------------
    // Test 7: Permanent Deletion
    // ----------------------------------------------------
    console.log('\n[Test 7] Testing permanent deletion operations...');
    await deleteNotification(notif1.id, workspaceId);
    const afterDeleteOne = await listNotifications(workspaceId, 10, true);
    if (afterDeleteOne.length !== 2) {
      throw new Error(`Expected 2 notifications after single delete, got: ${afterDeleteOne.length}`);
    }

    await deleteAllNotifications(workspaceId);
    const afterDeleteAll = await listNotifications(workspaceId, 10, true);
    if (afterDeleteAll.length !== 0) {
      throw new Error(`Expected 0 notifications in DB after deleteAll, got: ${afterDeleteAll.length}`);
    }
    console.log('  Passed: Permanent delete operations completed cleanly.');

    // Cleanup
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('\n  Cleaned up test workspace.');

    console.log('\n[PASS] All M7 notification read_at, dismissal, and bulk operation tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] M7 test failed:', err);
  process.exit(1);
});
