import { NextRequest, NextResponse } from 'next/server';
import { getConnectorDefinition } from '@/connectors/registry';
import { storeEncryptedToken } from '@/connectors/tokenStore';
import type { ConnectorType } from '@/core/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const def = getConnectorDefinition(id);
    if (!def) {
      return NextResponse.json({ error: `Connector '${id}' not recognized` }, { status: 404 });
    }

    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state'); // workspaceId
    const error = req.nextUrl.searchParams.get('error');

    if (error) {
      const redirectUrl = new URL('/app', req.url);
      redirectUrl.searchParams.set('section', 'sources');
      redirectUrl.searchParams.set('error', error);
      return NextResponse.redirect(redirectUrl);
    }

    if (!code || !state) {
      return NextResponse.json({ error: 'Missing OAuth authorization code or workspace state' }, { status: 400 });
    }

    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/api/connectors/${id}/callback`;
    let tokenData: Record<string, any> | null = null;

    // 1. Google (Gmail, Calendar, Drive)
    if (id === 'gmail' || id === 'calendar' || id === 'drive') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials not configured');
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenData?.error_description || tokenData?.error || 'Failed to exchange token with Google');
      }
    }

    // 2. GitHub
    else if (id === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('GitHub OAuth credentials not configured');
      }

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      tokenData = await tokenRes.json();
      if (!tokenRes.ok || tokenData?.error) {
        throw new Error(tokenData?.error_description || tokenData?.error || 'Failed to exchange token with GitHub');
      }
    }

    // 3. Slack
    else if (id === 'slack') {
      const clientId = process.env.SLACK_CLIENT_ID;
      const clientSecret = process.env.SLACK_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Slack OAuth credentials not configured');
      }

      const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      tokenData = await tokenRes.json();
      if (!tokenData?.ok) {
        throw new Error(tokenData?.error || 'Failed to exchange token with Slack');
      }
    }

    // 4. Notion
    else if (id === 'notion') {
      const clientId = process.env.NOTION_CLIENT_ID;
      const clientSecret = process.env.NOTION_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Notion OAuth credentials not configured');
      }

      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenData?.error || 'Failed to exchange token with Notion');
      }
    }

    if (!tokenData) {
      throw new Error(`Token exchange unsupported for connector ${id}`);
    }

    // Persist encrypted token in oauth_tokens PostgreSQL table
    await storeEncryptedToken(
      state,
      id as ConnectorType,
      tokenData,
      def.scopes
    );

    const redirectSuccess = new URL('/app', req.url);
    redirectSuccess.searchParams.set('section', 'sources');
    redirectSuccess.searchParams.set('connected', id);
    return NextResponse.redirect(redirectSuccess);
  } catch (err: any) {
    console.error(`[API /api/connectors/[id]/callback error]:`, err);
    const redirectError = new URL('/app', req.url);
    redirectError.searchParams.set('section', 'sources');
    redirectError.searchParams.set('error', 'oauth_exchange_failed');
    redirectError.searchParams.set('message', err.message || 'OAuth callback failed');
    return NextResponse.redirect(redirectError);
  }
}
