import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    const schedules = await query(
      `SELECT 
         s.id,
         COALESCE(s.name, 'Untitled Schedule') as name,
         s.question_template,
         s.cron,
         s.mode,
         s.enabled,
         s.created_at,
         b.as_of as last_run_as_of,
         b.question as last_run_question
       FROM schedules s
       LEFT JOIN briefs b ON b.id = s.last_run_brief_id
       WHERE s.workspace_id = $1
       ORDER BY s.created_at DESC`,
      [workspaceId]
    );

    return NextResponse.json({ schedules });
  } catch (err: any) {
    console.error('List schedules error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    // Operator-tier only enforcement (FR7.4, FR8.2)
    const ws = await queryOne<{ plan: string }>(
      `SELECT plan FROM workspaces WHERE id = $1`,
      [workspaceId]
    );

    if (!ws || ws.plan !== 'operator') {
      return NextResponse.json(
        {
          error: `Operator plan required to configure automated schedules. Current workspace plan is '${ws?.plan || 'free'}'.`,
          code: 'operator_plan_required',
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, question_template, cron, mode = 'home' } = body;

    if (!question_template || !cron) {
      return NextResponse.json({ error: 'question_template and cron are required' }, { status: 400 });
    }

    const newSched = await queryOne(
      `INSERT INTO schedules (workspace_id, name, question_template, cron, mode, enabled)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [workspaceId, name || 'New Brief Schedule', question_template, cron, mode]
    );

    return NextResponse.json({ schedule: newSched }, { status: 201 });
  } catch (err: any) {
    console.error('Create schedule error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
