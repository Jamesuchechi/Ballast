import { NextRequest, NextResponse } from 'next/server';
import { gmailConnector, DEFAULT_SYNC_WINDOW_DAYS } from '@/connectors/gmail';
import { getAuthSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req, true);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized or no workspace found' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

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
