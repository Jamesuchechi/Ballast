import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { testOutboundWebhook } from '@/core/outboundWebhooks';

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
    const result = await testOutboundWebhook(session.workspaceId, id);

    return NextResponse.json({
      success: result.success,
      result,
      message: result.success
        ? `Test payload successfully delivered in ${result.latencyMs}ms (HTTP ${result.statusCode})`
        : `Test delivery failed: ${result.error || 'Unknown error'}`,
    });
  } catch (err: any) {
    console.error('[API POST /api/webhooks/outbound/[id]/test error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to dispatch test payload' }, { status: 400 });
  }
}
