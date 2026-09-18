import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { getTemplateById } from '@/lib/templates';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const template = getTemplateById(id);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      template,
    });
  } catch (err: any) {
    console.error('[API /api/templates/[id] error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch template' },
      { status: 500 }
    );
  }
}
