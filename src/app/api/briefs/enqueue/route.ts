import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/db/client';
import { processQueuedBrief } from '@/core/pipelineWorker';

export async function POST(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get('ballast_session');
    let workspaceId: string | null = null;

    if (sessionCookie?.value) {
      const user = await queryOne<{ id: string }>(
        `SELECT id FROM users WHERE id::text = $1`,
        [sessionCookie.value]
      );
      if (user) {
        const member = await queryOne<{ workspace_id: string }>(
          `SELECT workspace_id FROM workspace_members WHERE user_id = $1 LIMIT 1`,
          [user.id]
        );
        if (member) workspaceId = member.workspace_id;
      }
    }

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (!defaultWs) {
        return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
      }
      workspaceId = defaultWs.id;
    }

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

    // 2. Dispatch async background worker execution (non-blocking, NFR3.1)
    setTimeout(() => {
      processQueuedBrief(briefId).catch((workerErr) => {
        console.error(`[BACKGROUND WORKER ERROR for brief ${briefId}]:`, workerErr);
      });
    }, 10);

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
