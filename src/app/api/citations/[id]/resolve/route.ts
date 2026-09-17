import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { resolveConflictCitation } from '@/core/conflictResolver';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid citation ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { resolutionType = 'confirmed_accurate', userNote, topic } = body;

    const validResolutions = ['confirmed_accurate', 'dismissed', 'superseded'];
    if (!validResolutions.includes(resolutionType)) {
      return NextResponse.json(
        { error: `Invalid resolutionType. Must be one of: ${validResolutions.join(', ')}` },
        { status: 400 }
      );
    }

    const result = await resolveConflictCitation({
      workspaceId: session.workspaceId,
      citationId: id,
      resolutionType,
      userNote: typeof userNote === 'string' ? userNote.trim() : undefined,
      userId: session.userId,
      topic: typeof topic === 'string' ? topic.trim() : undefined,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[API /api/citations/[id]/resolve] Error:', err);
    const status = err.message?.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}
