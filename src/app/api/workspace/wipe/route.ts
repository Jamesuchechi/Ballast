import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { wipeWorkspaceAccount } from '@/core/deletion';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (payload.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only workspace owner can wipe workspace' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.confirm !== 'DELETE_MY_WORKSPACE') {
      return NextResponse.json(
        { error: 'Confirmation string required: confirm must be "DELETE_MY_WORKSPACE"' },
        { status: 400 }
      );
    }

    const result = await wipeWorkspaceAccount(payload.workspaceId);

    const res = NextResponse.json({
      success: true,
      message: 'Workspace and all associated artifacts, embeddings, and tokens have been wiped.',
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
