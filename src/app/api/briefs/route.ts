import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const briefs = await query(
      `SELECT id, workspace_id, parent_brief_id, question, mode, status, 
              as_of, stale_after, progress, published_at, error, template_version, created_at
       FROM briefs
       WHERE workspace_id = $1
       ORDER BY as_of DESC`,
      [payload.workspaceId]
    );

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
