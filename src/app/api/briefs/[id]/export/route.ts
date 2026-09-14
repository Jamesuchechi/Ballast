import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { queryOne, query } from '@/db/client';
import { exportToObsidian, exportToNotion } from '@/core/exporters';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || !payload.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({ target: 'obsidian' }));
    const target = body.target || 'obsidian';

    // Fetch brief
    const brief = await queryOne<any>(
      `SELECT * FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [id, payload.workspaceId]
    );

    if (!brief) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    // Fetch citations
    const citations = await query(
      `SELECT c.*, s.connector, s.external_id as source_name 
       FROM citations c 
       LEFT JOIN sources s ON s.id = c.source_id 
       WHERE c.brief_id = $1`,
      [id]
    );

    if (target === 'obsidian') {
      const obsidianMd = exportToObsidian(brief, citations);
      return new NextResponse(obsidianMd, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="brief-${id.slice(0, 8)}-obsidian.md"`,
        },
      });
    }

    if (target === 'notion') {
      const notionResult = await exportToNotion(brief, citations);
      return NextResponse.json({
        success: true,
        target: 'notion',
        markdown: notionResult.markdown,
        format: notionResult.format,
      });
    }

    // Default raw markdown
    return new NextResponse(brief.markdown || '', {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="brief-${id.slice(0, 8)}.md"`,
      },
    });
  } catch (err: any) {
    console.error('[API /api/briefs/[id]/export error]:', err);
    return NextResponse.json({ error: err.message || 'Export failed' }, { status: 500 });
  }
}
