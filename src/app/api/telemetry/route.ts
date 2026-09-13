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

    const summary = await queryOne<{
      total_runs: number;
      total_cost: string;
      avg_latency_ms: number;
      total_tokens_in: number;
      total_tokens_out: number;
      circuit_broken_count: number;
    }>(
      `SELECT 
         COUNT(id)::int as total_runs,
         COALESCE(SUM(cost), 0)::numeric(10, 4) as total_cost,
         COALESCE(AVG(latency_ms), 0)::int as avg_latency_ms,
         COALESCE(SUM(tokens_in), 0)::int as total_tokens_in,
         COALESCE(SUM(tokens_out), 0)::int as total_tokens_out,
         COUNT(CASE WHEN circuit_broken = true THEN 1 END)::int as circuit_broken_count
       FROM runs
       WHERE workspace_id = $1`,
      [workspaceId]
    );

    const recentRuns = await query(
      `SELECT 
         r.id,
         r.brief_id,
         r.latency_ms,
         r.tokens_in,
         r.tokens_out,
         r.cost,
         r.circuit_broken,
         r.created_at,
         b.question as brief_question
       FROM runs r
       LEFT JOIN briefs b ON b.id = r.brief_id
       WHERE r.workspace_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [workspaceId]
    );

    return NextResponse.json({
      telemetry: summary || {
        total_runs: 0,
        total_cost: 0,
        avg_latency_ms: 0,
        total_tokens_in: 0,
        total_tokens_out: 0,
        circuit_broken_count: 0,
      },
      runs: recentRuns,
    });
  } catch (err: any) {
    console.error('List telemetry error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
