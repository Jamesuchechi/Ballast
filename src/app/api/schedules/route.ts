import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query, queryOne } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    let workspaceId: string | null = payload?.workspaceId || null;

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (!defaultWs) {
        return NextResponse.json({ schedules: [] });
      }
      workspaceId = defaultWs.id;
    }

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
    let workspaceId: string | null = payload?.workspaceId || null;

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (!defaultWs) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
      workspaceId = defaultWs.id;
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
