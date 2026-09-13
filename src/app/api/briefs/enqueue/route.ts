import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/db/client';
import { enqueueBriefJob } from '@/queue/briefQueue';
import { getAuthSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req, true);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized or no workspace found' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const body = await req.json();
    const { question, mode = 'home', parent_brief_id = null } = body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
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
