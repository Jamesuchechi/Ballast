import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { diffBriefsInChain } from '@/core/diff';

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fromId = searchParams.get('fromId');
    const toId = searchParams.get('toId');

    if (!fromId || !toId) {
      return NextResponse.json(
        { error: 'fromId and toId parameters are required' },
        { status: 400 }
      );
    }

    const diffResult = await diffBriefsInChain(payload.workspaceId, fromId, toId);
    return NextResponse.json({ diff: diffResult });
  } catch (err: any) {
    console.error('[API /api/briefs/diff error]:', err);
    const status = err.message?.includes('version chain') ? 400 : 500;
    return NextResponse.json({ error: err.message || 'Diff failed' }, { status });
  }
}
