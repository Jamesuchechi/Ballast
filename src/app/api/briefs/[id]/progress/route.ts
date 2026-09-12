import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/db/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const brief = await queryOne<{
      id: string;
      status: string;
      progress: any;
      error: string | null;
      published_at: string | null;
    }>(
      `SELECT id, status, progress, error, published_at FROM briefs WHERE id = $1`,
      [id]
    );

    if (!brief) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }

    return NextResponse.json({
      briefId: brief.id,
      status: brief.status,
      progress: brief.progress || [],
      error: brief.error,
      publishedAt: brief.published_at,
    });
  } catch (err: any) {
    console.error('[API /api/briefs/[id]/progress error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch progress' }, { status: 500 });
  }
}
