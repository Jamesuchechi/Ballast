import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/db/client';
import { gmailConnector, DEFAULT_SYNC_WINDOW_DAYS } from '@/connectors/gmail';

export async function POST(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get('ballast_session');
    let workspaceId: string | null = null;

    if (sessionCookie?.value) {
      const member = await queryOne<{ workspace_id: string }>(
        `SELECT workspace_id FROM workspace_members WHERE user_id = $1 LIMIT 1`,
        [sessionCookie.value]
      );
      if (member) workspaceId = member.workspace_id;
    }

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (defaultWs) workspaceId = defaultWs.id;
    }

    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const windowDays = typeof body.windowDays === 'number' ? body.windowDays : DEFAULT_SYNC_WINDOW_DAYS;
    const simulateRateLimit = Boolean(body.simulateRateLimit);
    const simulateError = Boolean(body.simulateError);

    const result = await gmailConnector.sync({
      workspaceId,
      windowDays,
      simulateRateLimit,
      simulateError,
    });

    if (result.error) {
      return NextResponse.json({
        success: false,
        error: result.error,
        result,
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('Gmail sync error:', err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
