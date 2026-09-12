import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { query } from '@/db/client';
import { seedCanonicalBrief, seedCanonicalWorldBrief } from '@/core/briefSeed';

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
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let mode: 'home' | 'world' = 'home';
    try {
      const body = await req.json();
      if (body?.mode === 'world') {
        mode = 'world';
      }
    } catch {}

    // Seed a canonical verified brief in this workspace
    const seedResult =
      mode === 'world'
        ? await seedCanonicalWorldBrief(payload.workspaceId)
        : await seedCanonicalBrief(payload.workspaceId);

    return NextResponse.json({
      message: `Brief created successfully (${mode} mode)`,
      briefId: seedResult.briefId,
      pdfUri: seedResult.pdfUri,
      mode,
    });
  } catch (err: any) {
    console.error('Create brief error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create brief' }, { status: 500 });
  }
}
