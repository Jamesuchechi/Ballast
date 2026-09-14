import { query, queryOne } from '@/db/client';

export interface PlanLimits {
  monthlyBriefs: number;
  schedulesAllowed: boolean;
  actionsAllowed: boolean;
  pdfAllowed: boolean;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    monthlyBriefs: 10,
    schedulesAllowed: false,
    actionsAllowed: false,
    pdfAllowed: false,
  },
  pro: {
    monthlyBriefs: 80,
    schedulesAllowed: false,
    actionsAllowed: false,
    pdfAllowed: true,
  },
  operator: {
    monthlyBriefs: 500,
    schedulesAllowed: true,
    actionsAllowed: true,
    pdfAllowed: true,
  },
};

export interface UsageCheckResult {
  allowed: boolean;
  count: number;
  limit: number;
  plan: string;
  error?: string;
}

/**
 * Calculates current month's brief usage for a given workspace.
 * Per FR8.1, metered per brief job that entered retrieval:
 * status IN ('running', 'needs_review', 'published', 'failed')
 */
export async function getWorkspaceMonthlyBriefUsage(workspaceId: string): Promise<number> {
  const res = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM briefs
     WHERE workspace_id = $1
       AND status IN ('running', 'needs_review', 'published', 'failed')
       AND created_at >= date_trunc('month', NOW())`,
    [workspaceId]
  );

  return res ? parseInt(res.count, 10) : 0;
}

/**
 * Verifies if workspace has quota available under its plan (FR8.1, FR8.2, FR8.5).
 * Scheduled runs and manual runs both count toward this meter.
 */
export async function checkWorkspaceBriefLimit(workspaceId: string): Promise<UsageCheckResult> {
  const ws = await queryOne<{ plan: string }>(
    `SELECT plan FROM workspaces WHERE id = $1`,
    [workspaceId]
  );

  const plan = ws?.plan || 'free';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const count = await getWorkspaceMonthlyBriefUsage(workspaceId);

  if (count >= limits.monthlyBriefs) {
    return {
      allowed: false,
      count,
      limit: limits.monthlyBriefs,
      plan,
      error: `Monthly brief quota exceeded for ${plan} tier (${count}/${limits.monthlyBriefs}). Upgrade your plan to run more briefs.`,
    };
  }

  return {
    allowed: true,
    count,
    limit: limits.monthlyBriefs,
    plan,
  };
}
