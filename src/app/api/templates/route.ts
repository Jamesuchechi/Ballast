import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { BRIEF_TEMPLATES, TEMPLATE_CATEGORIES, queryTemplates } from '@/lib/templates';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    const mode = searchParams.get('mode') as 'home' | 'world' | undefined;

    const templates = queryTemplates({
      category,
      search,
      mode: mode === 'home' || mode === 'world' ? mode : undefined,
    });

    return NextResponse.json({
      success: true,
      templates,
      categories: ['All', ...TEMPLATE_CATEGORIES],
      total: templates.length,
    });
  } catch (err: any) {
    console.error('[API /api/templates error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
