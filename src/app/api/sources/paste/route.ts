import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/db/client';
import { ingestPastedSnippet } from '@/core/ingest';

export async function POST(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get('ballast_session');
    let workspaceId: string | null = null;

    if (sessionCookie?.value) {
      const user = await queryOne<{ id: string }>(
        `SELECT id FROM users WHERE id::text = $1`,
        [sessionCookie.value]
      );
      if (user) {
        const member = await queryOne<{ workspace_id: string }>(
          `SELECT workspace_id FROM workspace_members WHERE user_id = $1 LIMIT 1`,
          [user.id]
        );
        if (member) workspaceId = member.workspace_id;
      }
    }

    if (!workspaceId) {
      const defaultWs = await queryOne<{ id: string }>(
        `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
      );
      if (!defaultWs) {
        return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
      }
      workspaceId = defaultWs.id;
    }

    const body = await req.json();
    const { title, text } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Text content is required' }, { status: 400 });
    }

    const result = await ingestPastedSnippet(
      workspaceId,
      title || 'Pasted Thread',
      text
    );

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error('[API /api/sources/paste error]:', err);
    return NextResponse.json({ error: err.message || 'Paste ingestion failed' }, { status: 500 });
  }
}
