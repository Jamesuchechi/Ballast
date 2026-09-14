import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { getAuthSession } from '@/lib/auth';
import { queryOne } from '@/db/client';
import { processQueuedBrief } from '@/core/pipelineWorker';
import { enqueueBriefJob } from '@/queue/briefQueue';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const workspaceId = session.workspaceId;

    // Verify parent brief exists and belongs to current workspace
    const original = await queryOne<{
      id: string;
      workspace_id: string;
      question: string;
      mode: 'home' | 'world';
    }>(
      `SELECT id, workspace_id, question, mode FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    if (!original) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    // In accordance with Ballast data model specifications:
    // Regeneration creates a NEW ROW with parent_brief_id set, never mutating the original.
    const childBriefId = crypto.randomUUID();
    const initProgress = [
      {
        step: 'queued',
        timestamp: new Date().toISOString(),
        message: 'Brief enqueued for regeneration over updated sources',
      },
    ];

    const childRow = await queryOne(
      `INSERT INTO briefs (
        id, workspace_id, parent_brief_id, question, mode, status, 
        progress, stale_after, template_version
      ) VALUES ($1, $2, $3, $4, $5, 'queued', $6::jsonb, NOW() + INTERVAL '7 days', 'v1')
      RETURNING *`,
      [
        childBriefId,
        workspaceId,
        original.id, // Links to parent!
        original.question,
        original.mode,
        JSON.stringify(initProgress),
      ]
    );

    // 1. Dispatch to BullMQ for dedicated worker execution
    try {
      await enqueueBriefJob(childBriefId, { workspaceId });
    } catch (qErr) {
      console.warn('[Regenerate] BullMQ dispatch error (fallback to background task):', qErr);
    }

    // 2. Schedule background execution via after() for serverless / worker-less environments
    after(async () => {
      try {
        await processQueuedBrief(childBriefId);
      } catch (procErr) {
        console.error('[Regenerate] Background pipeline execution error:', procErr);
      }
    });

    return NextResponse.json(
      {
        childBrief: childRow,
        status: 'queued',
        message: 'Regenerated brief enqueued for processing',
      },
      { status: 202 }
    );
  } catch (err: any) {
    console.error('Regenerate brief error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
