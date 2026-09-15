import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { queryOne } from '@/db/client';
import { enqueueBriefJob } from '@/queue/briefQueue';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid brief ID' }, { status: 400 });
    }

    const workspaceId = session.workspaceId;

    // Rate limit retries per workspace: 10 per minute
    const rateCheck = await checkRateLimit({
      key: `brief-retry:${workspaceId}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateCheck.success) {
      return rateLimitResponse(
        rateCheck,
        'Too many retry requests for this workspace. Please wait before retrying again.'
      );
    }

    // Verify brief exists and belongs to this workspace
    const existingBrief = await queryOne<{
      id: string;
      workspace_id: string;
      status: string;
      error: string | null;
      question: string;
      mode: string;
    }>(
      `SELECT id, workspace_id, status, error, question, mode FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    if (!existingBrief) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    // Only failed or aborted briefs should be retried
    if (existingBrief.status === 'published') {
      return NextResponse.json(
        { error: 'Cannot retry an already published brief. Use regenerate to produce a new revision.' },
        { status: 400 }
      );
    }

    if (existingBrief.status === 'queued' || existingBrief.status === 'generating') {
      return NextResponse.json(
        { error: 'Brief is currently processing. Please wait for the current run to complete.' },
        { status: 409 }
      );
    }

    // Reset status to queued, clear error, reset progress step
    const resetProgress = [
      {
        step: 'queued',
        timestamp: new Date().toISOString(),
        message: 'Brief retried and re-enqueued for background processing',
      },
    ];

    const updatedBrief = await queryOne(
      `UPDATE briefs SET
        status = 'queued',
        error = NULL,
        progress = $3::jsonb
      WHERE id = $1 AND workspace_id = $2
      RETURNING id, workspace_id, parent_brief_id, question, mode, status, as_of, stale_after, progress, error`,
      [id, workspaceId, JSON.stringify(resetProgress)]
    );

    // Enqueue to BullMQ worker queue
    await enqueueBriefJob(id, { workspaceId });

    return NextResponse.json(
      {
        success: true,
        brief: updatedBrief,
        status: 'queued',
        message: 'Brief re-enqueued for generation',
      },
      { status: 202 }
    );
  } catch (err: any) {
    console.error('Retry brief error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
