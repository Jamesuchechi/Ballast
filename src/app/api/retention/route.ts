import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import {
  getRetentionPolicies,
  updateRetentionPolicy,
  pruneExpiredSources,
} from '@/core/retention';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const policies = await getRetentionPolicies(session.workspaceId);
    return NextResponse.json({ policies });
  } catch (err: any) {
    console.error('[API GET /api/retention error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to load retention policies' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Owner role required to adjust workspace retention
    if (session.role !== 'owner') {
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

    await updateRetentionPolicy(session.workspaceId, connector, windowDays);
    const updated = await getRetentionPolicies(session.workspaceId);

    return NextResponse.json({ success: true, policies: updated });
  } catch (err: any) {
    console.error('[API PUT /api/retention error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to update retention policy' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const connector = body.connector || undefined;

    const result = await pruneExpiredSources(session.workspaceId, connector);

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
