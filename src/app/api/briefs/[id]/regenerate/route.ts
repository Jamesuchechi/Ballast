import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';
import { processQueuedBrief } from '@/core/pipelineWorker';

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

    // Process regeneration live through the grounded async pipeline
    const publishedBrief = await processQueuedBrief(childBriefId);

    const updatedChild = await queryOne(
      `SELECT * FROM briefs WHERE id = $1`,
      [childBriefId]
    );

    return NextResponse.json({
      childBrief: updatedChild || childRow,
      publishedBrief,
      message: 'Regenerated brief created as new version',
    });
  } catch (err: any) {
    console.error('Regenerate brief error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
