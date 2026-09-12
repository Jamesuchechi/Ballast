import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { queryOne } from '@/db/client';
import { objectStore } from '@/storage/objectStore';
import { generateSimplePdf } from '@/core/pdfRenderer';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? verifyToken(token) : null;

    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const brief = await queryOne<{
      id: string;
      question: string;
      markdown: string;
      pdf_uri: string | null;
    }>(
      `SELECT id, question, markdown, pdf_uri FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [id, payload.workspaceId]
    );

    if (!brief) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    let pdfBuffer: Buffer | null = null;

    if (brief.pdf_uri) {
      pdfBuffer = await objectStore.get(brief.pdf_uri);
    }

    // If PDF is not yet in storage or needs on-demand generation
    if (!pdfBuffer && brief.markdown) {
      const lines = brief.markdown.split('\n');
      pdfBuffer = generateSimplePdf(brief.question, lines);
    }

    if (!pdfBuffer) {
      return NextResponse.json({ error: 'PDF artifact not found' }, { status: 404 });
    }

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="brief_${id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('Download PDF error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
