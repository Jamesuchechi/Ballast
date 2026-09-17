import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { queryOne } from '@/db/client';
import {
  verifyGitHubSignature,
  verifySlackSignature,
  processGitHubWebhook,
  processSlackWebhook,
  processGenericWebhook,
} from '@/core/webhookHandler';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params;
    const rawBody = await req.text();

    let jsonBody: any = {};
    try {
      jsonBody = JSON.parse(rawBody);
    } catch {
      jsonBody = {};
    }

    // ----------------------------------------------------
    // Slack URL Verification Handshake
    // ----------------------------------------------------
    if (provider === 'slack' && jsonBody.type === 'url_verification') {
      return NextResponse.json({ challenge: jsonBody.challenge });
    }

    // ----------------------------------------------------
    // Workspace ID Resolution
    // ----------------------------------------------------
    let workspaceId =
      req.nextUrl.searchParams.get('workspace_id') ||
      req.nextUrl.searchParams.get('workspaceId') ||
      req.headers.get('x-workspace-id');

    if (!workspaceId) {
      // Check active auth session if sent via authenticated client
      const session = await getAuthSession(req);
      if (session && session.workspaceId) {
        workspaceId = session.workspaceId;
      }
    }

    if (!workspaceId) {
      return NextResponse.json(
        {
          error:
            'Missing workspace identifier. Please provide ?workspace_id=<id> or X-Workspace-Id header.',
        },
        { status: 400 }
      );
    }

    // Verify workspace exists
    const ws = await queryOne<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = $1`,
      [workspaceId]
    );
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // ----------------------------------------------------
    // Provider Specific Processing & Signature Validation
    // ----------------------------------------------------
    if (provider === 'github') {
      const githubSecret =
        process.env.GITHUB_WEBHOOK_SECRET || req.headers.get('x-webhook-secret');
      const sigHeader = req.headers.get('x-hub-signature-256');

      if (githubSecret && sigHeader) {
        const isValid = verifyGitHubSignature(rawBody, sigHeader, githubSecret);
        if (!isValid) {
          return NextResponse.json(
            { error: 'Invalid GitHub webhook signature' },
            { status: 401 }
          );
        }
      }

      const event = req.headers.get('x-github-event') || 'push';
      const result = await processGitHubWebhook({
        workspaceId,
        event,
        payload: jsonBody,
      });

      return NextResponse.json({
        success: true,
        provider: 'github',
        event,
        result: result || { message: 'Event received but ignored' },
      });
    }

    if (provider === 'slack') {
      const slackSecret =
        process.env.SLACK_SIGNING_SECRET || req.headers.get('x-webhook-secret');
      const sigHeader = req.headers.get('x-slack-signature');
      const tsHeader = req.headers.get('x-slack-request-timestamp');

      if (slackSecret && sigHeader && tsHeader) {
        const isValid = verifySlackSignature(rawBody, sigHeader, tsHeader, slackSecret);
        if (!isValid) {
          return NextResponse.json(
            { error: 'Invalid Slack webhook signature or timestamp expired' },
            { status: 401 }
          );
        }
      }

      const result = await processSlackWebhook({
        workspaceId,
        payload: jsonBody,
      });

      return NextResponse.json({
        success: true,
        provider: 'slack',
        result: result || { message: 'Event received' },
      });
    }

    if (provider === 'generic') {
      const { externalId, title, content, meta, connector = 'web' } = jsonBody;

      if (!externalId || !content) {
        return NextResponse.json(
          { error: 'externalId and content fields are required for generic webhooks' },
          { status: 400 }
        );
      }

      const result = await processGenericWebhook({
        workspaceId,
        connector,
        externalId,
        title: title || externalId,
        content,
        meta: meta || {},
      });

      return NextResponse.json({
        success: true,
        provider: 'generic',
        result,
      });
    }

    return NextResponse.json(
      { error: `Unsupported webhook provider '${provider}'. Supported: github, slack, generic.` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[WEBHOOK RECEIVER ERROR]:', err);
    return NextResponse.json(
      { error: err.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
