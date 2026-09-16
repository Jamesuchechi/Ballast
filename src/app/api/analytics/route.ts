import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';
import { getWorkspaceMonthlyBriefUsage, PLAN_LIMITS } from '@/core/usage';

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = payload.workspaceId;

    // 1. Workspace info & Plan
    const ws = await queryOne<{ plan: string; name: string }>(
      `SELECT plan, name FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    const plan = ws?.plan || 'free';
    const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // 2. Briefs status breakdown
    const briefStats = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text as count 
       FROM briefs 
       WHERE workspace_id = $1 
       GROUP BY status`,
      [workspaceId]
    );

    let totalBriefs = 0;
    let publishedBriefs = 0;
    let failedBriefs = 0;
    let runningBriefs = 0;

    for (const b of briefStats) {
      const cnt = parseInt(b.count, 10);
      totalBriefs += cnt;
      if (b.status === 'published') publishedBriefs = cnt;
      else if (b.status === 'failed') failedBriefs = cnt;
      else if (b.status === 'running' || b.status === 'queued') runningBriefs += cnt;
    }

    const completed = publishedBriefs + failedBriefs;
    const successRate = completed > 0 ? Math.round((publishedBriefs / completed) * 100) : 100;

    // 3. Runs Telemetry (latency, tokens, cost)
    const runsSummary = await queryOne<{
      total_tokens_in: string | null;
      total_tokens_out: string | null;
      total_cost: string | null;
      avg_latency_ms: string | null;
      runs_count: string | null;
    }>(
      `SELECT 
         SUM(tokens_in)::text as total_tokens_in,
         SUM(tokens_out)::text as total_tokens_out,
         SUM(cost)::text as total_cost,
         AVG(latency_ms)::text as avg_latency_ms,
         COUNT(*)::text as runs_count
       FROM runs 
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    const totalTokensIn = parseInt(runsSummary?.total_tokens_in || '0', 10);
    const totalTokensOut = parseInt(runsSummary?.total_tokens_out || '0', 10);
    const totalCost = parseFloat(runsSummary?.total_cost || '0');
    const avgLatencyMs = Math.round(parseFloat(runsSummary?.avg_latency_ms || '0'));
    const totalRuns = parseInt(runsSummary?.runs_count || '0', 10);
    const avgCostPerBrief = totalRuns > 0 ? (totalCost / totalRuns).toFixed(4) : '0.0025';

    // 4. Citations & Conflicts Breakdown
    const citationStats = await query<{ citation_type: string; count: string }>(
      `SELECT citation_type, COUNT(*)::text as count 
       FROM citations 
       WHERE workspace_id = $1 
       GROUP BY citation_type`,
      [workspaceId]
    );

    let totalCitations = 0;
    let supportCitations = 0;
    let conflictCitations = 0;
    let missingCitations = 0;
    let uncheckedCitations = 0;

    for (const c of citationStats) {
      const cnt = parseInt(c.count, 10);
      totalCitations += cnt;
      if (c.citation_type === 'support') supportCitations = cnt;
      else if (c.citation_type === 'conflict') conflictCitations = cnt;
      else if (c.citation_type === 'missing') missingCitations = cnt;
      else if (c.citation_type === 'unchecked') uncheckedCitations = cnt;
    }

    // Connectors distribution across sources
    const connectorStats = await query<{ connector: string; count: string }>(
      `SELECT connector, COUNT(*)::text as count 
       FROM sources 
       WHERE workspace_id = $1 
       GROUP BY connector 
       ORDER BY count DESC`,
      [workspaceId]
    );

    // 5. Actions breakdown
    const actionStats = await query<{ type: string; approved: boolean; executed: boolean; count: string }>(
      `SELECT 
         type, 
         (approved_at IS NOT NULL) as approved,
         (executed_at IS NOT NULL) as executed,
         COUNT(*)::text as count 
       FROM actions 
       WHERE workspace_id = $1 
       GROUP BY type, (approved_at IS NOT NULL), (executed_at IS NOT NULL)`,
      [workspaceId]
    );

    let totalActions = 0;
    let approvedActions = 0;
    let executedActions = 0;
    const actionTypesBreakdown: Record<string, number> = {};

    for (const a of actionStats) {
      const cnt = parseInt(a.count, 10);
      totalActions += cnt;
      if (a.approved) approvedActions += cnt;
      if (a.executed) executedActions += cnt;
      actionTypesBreakdown[a.type] = (actionTypesBreakdown[a.type] || 0) + cnt;
    }

    // 6. Monthly Brief Quota Metering
    const monthlyBriefsUsed = await getWorkspaceMonthlyBriefUsage(workspaceId);
    const monthlyBriefLimit = planLimits.monthlyBriefs;
    const quotaPercent = Math.min(100, Math.round((monthlyBriefsUsed / monthlyBriefLimit) * 100));

    // 7. Recent activity timeline (last 14 days)
    const timeline = await query<{ day: string; count: string }>(
      `SELECT 
         to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
         COUNT(*)::text as count
       FROM briefs
       WHERE workspace_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
       GROUP BY date_trunc('day', created_at)
       ORDER BY day ASC`,
      [workspaceId]
    );

    return NextResponse.json({
      plan,
      workspaceName: ws?.name || 'Workspace',
      briefs: {
        total: totalBriefs,
        published: publishedBriefs,
        failed: failedBriefs,
        running: runningBriefs,
        successRate,
      },
      telemetry: {
        totalTokensIn,
        totalTokensOut,
        totalTokens: totalTokensIn + totalTokensOut,
        totalCostUsd: totalCost.toFixed(4),
        avgCostPerBrief,
        avgLatencyMs,
        totalRuns,
      },
      citations: {
        total: totalCitations,
        support: supportCitations,
        conflict: conflictCitations,
        missing: missingCitations,
        unchecked: uncheckedCitations,
        conflictFrequencyPercent: totalBriefs > 0 ? Math.round((conflictCitations / Math.max(1, totalBriefs)) * 100) : 0,
      },
      connectors: connectorStats.map((c) => ({
        connector: c.connector,
        count: parseInt(c.count, 10),
      })),
      actions: {
        total: totalActions,
        approved: approvedActions,
        executed: executedActions,
        breakdown: actionTypesBreakdown,
        executionRate: approvedActions > 0 ? Math.round((executedActions / approvedActions) * 100) : 0,
      },
      meter: {
        used: monthlyBriefsUsed,
        limit: monthlyBriefLimit,
        percent: quotaPercent,
      },
      timeline: timeline.map((t) => ({
        day: t.day,
        count: parseInt(t.count, 10),
      })),
    });
  } catch (err: any) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
