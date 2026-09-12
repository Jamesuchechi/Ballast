import { NextRequest, NextResponse } from 'next/server';
import { ingestPastedSnippet } from '@/core/ingest';
import { getAuthSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req, true);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized or no workspace found' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

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
