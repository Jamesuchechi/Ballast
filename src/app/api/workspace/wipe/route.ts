import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, COOKIE_NAME } from '@/lib/auth';
import { wipeWorkspaceAccount } from '@/core/deletion';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only workspace owner can wipe workspace' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.confirm !== 'DELETE_MY_WORKSPACE') {
      return NextResponse.json(
        { error: 'Confirmation string required: confirm must be "DELETE_MY_WORKSPACE"' },
        { status: 400 }
      );
    }

    const result = await wipeWorkspaceAccount(session.workspaceId);

    const res = NextResponse.json({
      success: true,
      message: 'Workspace and all associated artifacts, vectors, and tokens have been wiped.',
      purgedFilesCount: result.purgedFilesCount,
    });

    // Clear session cookie
    res.cookies.delete(COOKIE_NAME);
    return res;
  } catch (err: any) {
    console.error('[API /api/workspace/wipe error]:', err);
    return NextResponse.json({ error: err.message || 'Wipe failed' }, { status: 500 });
  }
}
