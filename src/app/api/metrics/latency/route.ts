import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query } from '@/db/client';

function calculatePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export const LATENCY_TARGETS = {
  home: {
    p50MaxMs: 4500,
    p95MaxMs: 12000,
  },
  world: {
    p50MaxMs: 9000,
    p95MaxMs: 25000,
  },
};

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const runs = await query<{
      id: string;
      brief_id: string;
      latency_ms: number;
      cost: string;
      created_at: string;
      mode: string;
      question: string;
    }>(
      `SELECT r.id, r.brief_id, r.latency_ms, r.cost, r.created_at, b.mode, b.question
       FROM runs r
       JOIN briefs b ON b.id = r.brief_id
       WHERE r.workspace_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [payload.workspaceId]
    );

    const allLatencies = runs.map((r) => Number(r.latency_ms) || 0);
    const homeLatencies = runs.filter((r) => r.mode === 'home').map((r) => Number(r.latency_ms) || 0);
    const worldLatencies = runs.filter((r) => r.mode === 'world').map((r) => Number(r.latency_ms) || 0);

    const computeStats = (latencies: number[]) => {
      if (latencies.length === 0) {
        return { count: 0, p50: 0, p95: 0, avg: 0, min: 0, max: 0 };
      }
      const sum = latencies.reduce((a, b) => a + b, 0);
      return {
        count: latencies.length,
        p50: calculatePercentile(latencies, 50),
        p95: calculatePercentile(latencies, 95),
        avg: Math.round(sum / latencies.length),
        min: Math.min(...latencies),
        max: Math.max(...latencies),
      };
    };

    const overallStats = computeStats(allLatencies);
    const homeStats = computeStats(homeLatencies);
    const worldStats = computeStats(worldLatencies);

    return NextResponse.json({
      targets: LATENCY_TARGETS,
      metrics: {
        overall: overallStats,
        home: homeStats,
        world: worldStats,
      },
      timeSeries: runs.map((r) => ({
        runId: r.id,
        briefId: r.brief_id,
        question: r.question,
        mode: r.mode,
        latencyMs: Number(r.latency_ms) || 0,
        createdAt: r.created_at,
      })),
    });
  } catch (err: any) {
    console.error('[API /api/metrics/latency error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch latency metrics' }, { status: 500 });
  }
}
