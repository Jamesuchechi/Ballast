import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { queryOne, query } from '@/db/client';
import { validateQuestionTemplate } from '@/lib/templateValidator';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const { id } = await params;
    const body = await req.json();

    const current = await queryOne(
      `SELECT * FROM schedules WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    if (!current) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    if (typeof body.question_template === 'string') {
      const validation = validateQuestionTemplate(body.question_template);
      if (!validation.valid) {
        return NextResponse.json(
          {
            error: `Invalid question template: ${validation.errors.join('; ')}`,
            errors: validation.errors,
            unrecognizedTags: validation.unrecognizedTags,
          },
          { status: 400 }
        );
      }
    }

    const updatedEnabled = typeof body.enabled === 'boolean' ? body.enabled : current.enabled;
    const updatedName = typeof body.name === 'string' ? body.name : current.name;
    const updatedTemplate = typeof body.question_template === 'string' ? body.question_template : current.question_template;
    const updatedCron = typeof body.cron === 'string' ? body.cron : current.cron;
    const updatedTz = typeof body.timezone === 'string' ? body.timezone : (current.timezone || 'UTC');
    const updatedMode = typeof body.mode === 'string' ? body.mode : current.mode;

    const updated = await queryOne(
      `UPDATE schedules 
       SET enabled = $1,
           name = $2,
           question_template = $3,
           cron = $4,
           timezone = $5,
           mode = $6
       WHERE id = $7 AND workspace_id = $8
       RETURNING *`,
      [updatedEnabled, updatedName, updatedTemplate, updatedCron, updatedTz, updatedMode, id, workspaceId]
    );

    return NextResponse.json({ schedule: updated });
  } catch (err: any) {
    console.error('Update schedule error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const { id } = await params;

    await query(
      `DELETE FROM schedules WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId]
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete schedule error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
