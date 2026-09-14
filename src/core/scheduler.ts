import crypto from 'crypto';
import { query, queryOne } from '@/db/client';
import { checkWorkspaceBriefLimit } from './usage';
import { enqueueBriefJob } from '@/queue/briefQueue';
import { createNotification } from './notifications';

export interface ScheduleRow {
  id: string;
  workspace_id: string;
  cron: string;
  question_template: string;
  mode: 'home' | 'world';
  last_run_brief_id: string | null;
  enabled: boolean;
  name: string | null;
  created_at: string;
  plan?: string;
}

export interface RunScheduleResult {
  briefId: string;
  scheduleId: string;
  parentBriefId: string | null;
  question: string;
  status: string;
}

/**
 * Resolves question template into dynamic prompt text
 */
export function renderQuestionTemplate(template: string): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  return template.replace(/\{\{\s*date\s*\}\}/gi, dateStr);
}

/**
 * Executes a schedule run (FR7.1, FR7.2, FR7.3, FR7.4, FR8.1).
 * Chained via parent_brief_id pointing to schedule.last_run_brief_id.
 * Enforces Operator plan and brief quota.
 */
export async function runSchedule(
  scheduleId: string
): Promise<RunScheduleResult> {
  const schedule = await queryOne<ScheduleRow>(
    `SELECT s.*, w.plan 
     FROM schedules s
     JOIN workspaces w ON w.id = s.workspace_id
     WHERE s.id = $1`,
    [scheduleId]
  );

  if (!schedule) {
    throw new Error(`Schedule ${scheduleId} not found`);
  }

  if (!schedule.enabled) {
    throw new Error(`Schedule ${scheduleId} is disabled`);
  }

  // Operator-tier only (FR7.4, FR8.2)
  if (schedule.plan !== 'operator') {
    throw new Error(
      `Operator plan required to run scheduled briefs. Workspace plan is '${schedule.plan || 'free'}'.`
    );
  }

  // Scheduled runs count against the Operator brief meter (FR8.1)
  const quotaCheck = await checkWorkspaceBriefLimit(schedule.workspace_id);
  if (!quotaCheck.allowed) {
    throw new Error(quotaCheck.error || 'Monthly brief quota exceeded for workspace');
  }

  const question = renderQuestionTemplate(schedule.question_template);
  const parentBriefId = schedule.last_run_brief_id; // Chaining recurrence (FR7.3)
  const briefId = crypto.randomUUID();

  const initProgress = [
    {
      step: 'queued',
      timestamp: new Date().toISOString(),
      message: `Scheduled run triggered from "${schedule.name || 'Automated Schedule'}"`,
    },
  ];

  // Insert brief with schedule_id and parent_brief_id set (FR7.3)
  await query(
    `INSERT INTO briefs (
      id, workspace_id, parent_brief_id, schedule_id, question, mode, status,
      progress, stale_after, template_version
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'queued',
      $7::jsonb, NOW() + INTERVAL '7 days', 'v1'
    )`,
    [
      briefId,
      schedule.workspace_id,
      parentBriefId,
      schedule.id,
      question,
      schedule.mode,
      JSON.stringify(initProgress),
    ]
  );

  // Update schedule's last_run_brief_id to point to the newly created run
  await query(
    `UPDATE schedules SET last_run_brief_id = $1 WHERE id = $2`,
    [briefId, schedule.id]
  );

  // Send schedule run notification
  await createNotification({
    workspaceId: schedule.workspace_id,
    briefId,
    type: 'schedule_run',
    title: `Schedule Triggered: ${schedule.name || 'Automated Brief'}`,
    message: `Scheduled run started for question: "${question}"`,
  });

  // Dispatch exclusively to BullMQ background queue
  await enqueueBriefJob(briefId, { workspaceId: schedule.workspace_id });

  return {
    briefId,
    scheduleId: schedule.id,
    parentBriefId,
    question,
    status: 'queued',
  };
}
