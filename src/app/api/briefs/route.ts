import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const payload = await getAuthSession(req);

    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const starredParam = searchParams.get('starred');
    const modeParam = searchParams.get('mode');

    let queryStr = `SELECT id, workspace_id, parent_brief_id, question, mode, status, summary,
                           starred, as_of, stale_after, progress, published_at, error, template_version, created_at
                    FROM briefs
                    WHERE workspace_id = $1`;
    const params: any[] = [payload.workspaceId];

    if (starredParam === 'true') {
      params.push(true);
      queryStr += ` AND starred = $${params.length}`;
    }

    if (modeParam === 'home' || modeParam === 'world') {
      params.push(modeParam);
      queryStr += ` AND mode = $${params.length}`;
    }

    queryStr += ` ORDER BY as_of DESC`;

    const briefs = await query(queryStr, params);

    return NextResponse.json({ briefs });
  } catch (err: any) {
    console.error('List briefs error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return NextResponse.json(
    { error: 'POST /api/briefs is disabled. All briefs must be generated via /api/briefs/enqueue.' },
    { status: 405 }
  );
}
