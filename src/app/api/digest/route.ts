import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { previewWorkspaceDigest, sendWorkspaceDigest } from '@/core/digestService';
import { queryOne } from '@/db/client';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const lookbackDaysParam = searchParams.get('lookbackDays');
    const lookbackDays = lookbackDaysParam ? parseInt(lookbackDaysParam, 10) : 7;

    const preview = await previewWorkspaceDigest(session.workspaceId, isNaN(lookbackDays) ? 7 : lookbackDays);

    return NextResponse.json({
      success: true,
      digest: preview.data,
      html: preview.html,
      text: preview.text,
    });
  } catch (err: any) {
    console.error('[API GET /api/digest error]:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const lookbackDays = typeof body.lookbackDays === 'number' ? body.lookbackDays : 7;
    const force = Boolean(body.force);
    let targetEmail = body.testEmail;

    if (!targetEmail && body.sendToSelf) {
      const user = await queryOne<{ email: string }>(
        `SELECT email FROM users WHERE id = $1`,
        [session.userId]
      );
      targetEmail = user?.email;
    }

    const result = await sendWorkspaceDigest({
      workspaceId: session.workspaceId,
      lookbackDays,
      force: force || Boolean(targetEmail),
      testEmail: targetEmail,
      recipientUserIds: !targetEmail ? [session.userId] : undefined,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error('[API POST /api/digest error]:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
