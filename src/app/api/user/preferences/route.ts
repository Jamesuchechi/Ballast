import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export interface UserNotificationPreferences {
  email_enabled?: boolean;
  notify_on_publish?: boolean;
  notify_on_fail?: boolean;
}

const DEFAULT_PREFERENCES: Required<UserNotificationPreferences> = {
  email_enabled: true,
  notify_on_publish: true,
  notify_on_fail: true,
};

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const row = await queryOne<{ notification_preferences: UserNotificationPreferences | null }>(
      `SELECT (to_jsonb(u.*) -> 'notification_preferences')::jsonb as notification_preferences FROM users u WHERE u.id = $1`,
      [payload.userId]
    );

    const preferences = {
      ...DEFAULT_PREFERENCES,
      ...(row?.notification_preferences || {}),
    };

    return NextResponse.json({ preferences });
  } catch (err: any) {
    console.error('[API GET /api/user/preferences error]:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { preferences } = body;

    if (!preferences || typeof preferences !== 'object') {
      return NextResponse.json({ error: 'Invalid preferences payload' }, { status: 400 });
    }

    const currentRow = await queryOne<{ notification_preferences: UserNotificationPreferences | null }>(
      `SELECT (to_jsonb(u.*) -> 'notification_preferences')::jsonb as notification_preferences FROM users u WHERE u.id = $1`,
      [payload.userId]
    );

    const merged = {
      ...DEFAULT_PREFERENCES,
      ...(currentRow?.notification_preferences || {}),
      ...(typeof preferences.email_enabled === 'boolean' ? { email_enabled: preferences.email_enabled } : {}),
      ...(typeof preferences.notify_on_publish === 'boolean' ? { notify_on_publish: preferences.notify_on_publish } : {}),
      ...(typeof preferences.notify_on_fail === 'boolean' ? { notify_on_fail: preferences.notify_on_fail } : {}),
    };

    await query(
      `UPDATE users SET notification_preferences = $1 WHERE id = $2`,
      [JSON.stringify(merged), payload.userId]
    );

    return NextResponse.json({
      success: true,
      message: 'Notification preferences updated',
      preferences: merged,
    });
  } catch (err: any) {
    console.error('[API PATCH /api/user/preferences error]:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
