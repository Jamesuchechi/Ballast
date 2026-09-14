import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import {
  getRetentionPolicies,
  updateRetentionPolicy,
  pruneExpiredSources,
} from '@/core/retention';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const policies = await getRetentionPolicies(payload.workspaceId);
    return NextResponse.json({ policies });
  } catch (err: any) {
    console.error('[API GET /api/retention error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to load retention policies' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Owner role required to adjust workspace retention
    if (payload.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const body = await req.json();
    const { connector, windowDays } = body;

    if (!connector || typeof windowDays !== 'number') {
      return NextResponse.json(
        { error: 'connector (string) and windowDays (number) are required' },
        { status: 400 }
      );
    }

    await updateRetentionPolicy(payload.workspaceId, connector, windowDays);
    const updated = await getRetentionPolicies(payload.workspaceId);

    return NextResponse.json({ success: true, policies: updated });
  } catch (err: any) {
    console.error('[API PUT /api/retention error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to update retention policy' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (payload.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const connector = body.connector || undefined;

    const result = await pruneExpiredSources(payload.workspaceId, connector);

    return NextResponse.json({
      success: true,
      message: `Pruned ${result.prunedCount} expired sources beyond retention window`,
      ...result,
    });
  } catch (err: any) {
    console.error('[API POST /api/retention prune error]:', err);
    return NextResponse.json({ error: err.message || 'Prune failed' }, { status: 500 });
  }
}
