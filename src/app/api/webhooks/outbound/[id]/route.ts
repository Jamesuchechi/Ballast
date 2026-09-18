import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import {
  getOutboundWebhook,
  updateOutboundWebhook,
  deleteOutboundWebhook,
} from '@/core/outboundWebhooks';

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
    const webhook = await getOutboundWebhook(session.workspaceId, id);
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({ webhook });
  } catch (err: any) {
    console.error('[API GET /api/webhooks/outbound/[id] error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const updated = await updateOutboundWebhook({
      workspaceId: session.workspaceId,
      id,
      url: body.url,
      secret: body.secret,
      events: body.events,
      description: body.description,
      isActive: body.isActive,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      webhook: updated,
      message: 'Outbound webhook updated successfully',
    });
  } catch (err: any) {
    console.error('[API PATCH /api/webhooks/outbound/[id] error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to update webhook' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const deleted = await deleteOutboundWebhook(session.workspaceId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Outbound webhook deleted successfully',
    });
  } catch (err: any) {
    console.error('[API DELETE /api/webhooks/outbound/[id] error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete webhook' }, { status: 500 });
  }
}
