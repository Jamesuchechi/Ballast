import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import {
  listOutboundWebhooks,
  createOutboundWebhook,
  SUPPORTED_OUTBOUND_EVENTS,
} from '@/core/outboundWebhooks';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhooks = await listOutboundWebhooks(session.workspaceId);

    return NextResponse.json({
      webhooks,
      supportedEvents: SUPPORTED_OUTBOUND_EVENTS,
      count: webhooks.length,
    });
  } catch (err: any) {
    console.error('[API GET /api/webhooks/outbound error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { url, secret, events, description, isActive } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Webhook URL is required' }, { status: 400 });
    }

    const webhook = await createOutboundWebhook({
      workspaceId: session.workspaceId,
      url,
      secret,
      events,
      description,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return NextResponse.json({
      success: true,
      webhook,
      message: 'Outbound webhook registered successfully',
    }, { status: 201 });
  } catch (err: any) {
    console.error('[API POST /api/webhooks/outbound error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to create webhook' }, { status: 400 });
  }
}
