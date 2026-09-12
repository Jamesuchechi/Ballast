import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/db/client';
import { gmailConnector } from '@/connectors/gmail';

export async function GET(req: NextRequest) {
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
