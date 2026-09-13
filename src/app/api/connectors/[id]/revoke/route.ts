import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { getConnector } from '@/connectors/registry';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req, true);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized or no workspace found' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const { id } = await params;
    const connector = getConnector(id);

    if (!connector) {
      return NextResponse.json({ error: `Connector '${id}' not found in registry` }, { status: 404 });
    }

    await connector.revoke(workspaceId);

    return NextResponse.json({
      success: true,
      message: `Connector '${id}' revoked successfully`,
    });
  } catch (err: any) {
    console.error(`[API /api/connectors/[id]/revoke error]:`, err);
    return NextResponse.json({ error: err.message || 'Revoke failed' }, { status: 500 });
  }
}
