import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { query, queryOne } from '@/db/client';
import { createShareToken } from '@/lib/shareTokens';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await getAuthSession(req);
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const rawHours = body.expiresInHours ? parseInt(body.expiresInHours, 10) : 72;
    const expiresInHours = isNaN(rawHours) || rawHours <= 0 ? 72 : Math.min(rawHours, 720); // Max 30 days

    // Verify brief exists in user's workspace
    const brief = await queryOne<{ id: string; question: string; mode: string; status: string }>(
      `SELECT id, question, mode, status FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [id, payload.workspaceId]
    );

    if (!brief) {
      return NextResponse.json({ error: 'Brief not found in workspace' }, { status: 404 });
    }

    const { token, expiresAt, exp } = createShareToken(brief.id, payload.workspaceId, expiresInHours);

    // Resolve base URL for share link
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
    const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const shareUrl = `${proto}://${host}/share/${token}`;

    // Record audit trail entry
    try {
      await query(
        `INSERT INTO access_logs (workspace_id, user_id, action, meta)
         VALUES ($1, $2, 'brief_share:create', $3)`,
        [
          payload.workspaceId,
          payload.userId,
          JSON.stringify({
            brief_id: brief.id,
            expires_in_hours: expiresInHours,
            expires_at: expiresAt,
          }),
        ]
      );
    } catch (logErr) {
      console.warn('[Audit Log Error]:', logErr);
    }

    return NextResponse.json({
      success: true,
      shareUrl,
      token,
      expiresInHours,
      expiresAt,
      exp,
    });
  } catch (err: any) {
    console.error('[API /api/briefs/[id]/share error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to create share link' }, { status: 500 });
  }
}
