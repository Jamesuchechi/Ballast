import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';
import { enqueueBriefJob } from '@/queue/briefQueue';
import { getAuthSession } from '@/lib/auth';
import { checkWorkspaceBriefLimit } from '@/core/usage';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);

    // 1. Per-IP burst rate limit (prevents rapid unauthenticated/bot flooding)
    const ipLimit = await checkRateLimit({
      key: `briefs:enqueue:ip:${clientIp}`,
      limit: 15,
      windowSeconds: 60,
    });
    if (!ipLimit.success) {
      return rateLimitResponse(
        ipLimit,
        'Too many brief requests from this IP. Please wait a minute before trying again.'
      );
    }

    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    // 2. Per-workspace rate limit (prevents burst loops running up LLM bills)
    const wsLimit = await checkRateLimit({
      key: `briefs:enqueue:ws:${workspaceId}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!wsLimit.success) {
      return rateLimitResponse(
        wsLimit,
        'Too many briefs submitted in a short burst for this workspace. Please wait 60 seconds before submitting another brief.'
      );
    }

    const body = await req.json();
    const { question, mode = 'home', parent_brief_id = null } = body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Check monthly brief quota (FR8.1, FR8.2, FR8.5)
    const usageCheck = await checkWorkspaceBriefLimit(workspaceId);
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: usageCheck.error, code: 'quota_exceeded' },
        { status: 402 }
      );
    }

    // NFR7.6: Composer cannot submit World mode on Free
    if (mode === 'world' && usageCheck.plan === 'free') {
      return NextResponse.json(
        { error: 'World mode requires a Pro or Operator plan.', code: 'plan_upgrade_required' },
        { status: 403 }
      );
    }

    // 1. Insert brief row with status='queued' and canonical progress
    const queuedEntry = {
      step: 'queued',
      timestamp: new Date().toISOString(),
      message: 'Brief enqueued for asynchronous processing',
    };

    const rows = await query<{ id: string }>(
      `INSERT INTO briefs (
        workspace_id, parent_brief_id, question, mode, status,
        progress, stale_after
      ) VALUES (
        $1, $2, $3, $4, 'queued',
        $5::jsonb, NOW() + INTERVAL '7 days'
      ) RETURNING id`,
      [
        workspaceId,
        parent_brief_id || null,
        question.trim(),
        mode,
        JSON.stringify([queuedEntry]),
      ]
    );

    const briefId = rows[0].id;

    // 2. Dispatch job into persistent BullMQ queue backed by Redis / Upstash (NFR3.1)
    await enqueueBriefJob(briefId, { workspaceId });

    // 3. Return immediately with status='queued'
    return NextResponse.json(
      {
        briefId,
        status: 'queued',
        question: question.trim(),
        mode,
      },
      { status: 202 }
    );
  } catch (err: any) {
    console.error('[API /api/briefs/enqueue error]:', err);
    return NextResponse.json({ error: err.message || 'Enqueue failed' }, { status: 500 });
  }
}
