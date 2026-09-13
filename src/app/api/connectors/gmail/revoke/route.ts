import { NextRequest, NextResponse } from 'next/server';
import { gmailConnector } from '@/connectors/gmail';
import { getAuthSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    await gmailConnector.revoke(workspaceId);

    return NextResponse.json({
      success: true,
      message: 'Gmail connector access revoked',
    });
  } catch (err: any) {
    console.error('Gmail revoke error:', err);
    return NextResponse.json({ error: err.message || 'Revoke failed' }, { status: 500 });
  }
}
