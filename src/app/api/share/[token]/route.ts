import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/db/client';
import { verifyShareToken } from '@/lib/shareTokens';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const payload = verifyShareToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'This share link is invalid, malformed, or has expired.' },
        { status: 401 }
      );
    }

    // Query brief strictly by verified briefId and workspaceId
    const brief = await queryOne<{
      id: string;
      question: string;
      mode: string;
      status: string;
      markdown: string | null;
      as_of: string;
      published_at: string | null;
      created_at: string;
    }>(
      `SELECT id, question, mode, status, markdown, as_of, published_at, created_at
       FROM briefs 
       WHERE id = $1 AND workspace_id = $2`,
      [payload.briefId, payload.workspaceId]
    );

    if (!brief) {
      return NextResponse.json({ error: 'Shared brief not found' }, { status: 404 });
    }

    const expiresAt = new Date(payload.exp * 1000).toISOString();

    // Return sanitized read-only brief representation (zero internal sources/credentials/members exposed)
    return NextResponse.json({
      brief: {
        id: brief.id,
        question: brief.question,
        mode: brief.mode,
        status: brief.status,
        markdown: brief.markdown || '',
        as_of: brief.as_of,
        published_at: brief.published_at || brief.created_at,
      },
      expiresAt,
      isExpired: false,
    });
  } catch (err: any) {
    console.error('[API /api/share/[token] error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to retrieve shared brief' }, { status: 500 });
  }
}
