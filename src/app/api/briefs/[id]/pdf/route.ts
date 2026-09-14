import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { queryOne } from '@/db/client';

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

    // Verify brief belongs to authenticated workspace
    const brief = await queryOne<{ id: string }>(
      `SELECT id FROM briefs WHERE id = $1 AND workspace_id = $2`,
      [id, session.workspaceId]
    );

    if (!brief) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    const workerUrl = process.env.WORKER_URL || 'http://localhost:10000';
    const targetUrl = `${workerUrl.replace(/\/+$/, '')}/briefs/${id}/pdf`;

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Ballast-Frontend/1.0',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'PDF artifact not found' },
        { status: res.status }
      );
    }

    const pdfBuffer = await res.arrayBuffer();
    return new NextResponse(pdfBuffer, {
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
