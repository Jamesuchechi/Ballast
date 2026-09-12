import { NextRequest, NextResponse } from 'next/server';
import { gmailConnector } from '@/connectors/gmail';
import { getAuthSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req, true);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized or no workspace found' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const health = await gmailConnector.health(workspaceId);
    return NextResponse.json({
      connector: 'gmail',
      health,
    });
  } catch (err: any) {
    console.error('Gmail status error:', err);
    return NextResponse.json({ error: err.message || 'Status check failed' }, { status: 500 });
  }
}
