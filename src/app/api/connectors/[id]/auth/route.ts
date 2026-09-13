import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { getConnectorDefinition } from '@/connectors/registry';
import { storeEncryptedToken } from '@/connectors/tokenStore';
import { getConnectorRedirectUri } from '@/lib/url';
import type { ConnectorType } from '@/core/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const { id } = await params;
    const def = getConnectorDefinition(id);
    if (!def) {
      return NextResponse.json({ error: `Connector '${id}' not recognized` }, { status: 404 });
    }

    const wantsMock = req.nextUrl.searchParams.get('mock') === 'true';
    const isMockPermitted = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';

    // Mock connection is ONLY permitted behind explicit ?mock=true AND test/eval env
    if (wantsMock && isMockPermitted) {
      await storeEncryptedToken(
        workspaceId,
        id as ConnectorType,
        {
          access_token: `mock_${id}_token_${Date.now()}`,
          refresh_token: `mock_${id}_refresh_${Date.now()}`,
          token_type: 'Bearer',
          expiry_date: Date.now() + 3600 * 1000,
        },
        def.scopes
      );
      return NextResponse.redirect(new URL(`/app?section=sources&connected=${id}`, req.url));
    }

    const redirectUri = getConnectorRedirectUri(id, req);

    // 1. Google Ecosystem (Gmail, Calendar, Drive)
    if (id === 'gmail' || id === 'calendar' || id === 'drive') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return respondUnconfigured(
          req,
          id,
          'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'
        );
      }

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', def.scopes.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', workspaceId);

      return NextResponse.redirect(authUrl.toString());
    }

    // 2. GitHub
    if (id === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        return respondUnconfigured(
          req,
          id,
          'GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env'
        );
      }

      const authUrl = new URL('https://github.com/login/oauth/authorize');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('scope', def.scopes.join(' '));
      authUrl.searchParams.set('state', workspaceId);

      return NextResponse.redirect(authUrl.toString());
    }

    // 3. Slack
    if (id === 'slack') {
      const clientId = process.env.SLACK_CLIENT_ID;
      if (!clientId) {
        return respondUnconfigured(
          req,
          id,
          'Slack OAuth is not configured. Please set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in .env'
        );
      }

      const authUrl = new URL('https://slack.com/oauth/v2/authorize');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('user_scope', def.scopes.join(','));
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('state', workspaceId);

      return NextResponse.redirect(authUrl.toString());
    }

    // 4. Notion
    if (id === 'notion') {
      const clientId = process.env.NOTION_CLIENT_ID;
      if (clientId) {
        const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('owner', 'user');
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('state', workspaceId);
        return NextResponse.redirect(authUrl.toString());
      }

      return respondUnconfigured(
        req,
        id,
        'Notion Integration is not configured. Provide NOTION_CLIENT_ID in .env or configure internal token directly.'
      );
    }

    return NextResponse.json({ error: `Unsupported connector auth: ${id}` }, { status: 400 });
  } catch (err: any) {
    console.error('[API /api/connectors/[id]/auth error]:', err);
    return NextResponse.json({ error: err.message || 'Auth initialization failed' }, { status: 500 });
  }
}

/**
 * Also supports POST to save direct API tokens (e.g. for Notion Internal Integration Token)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const { id } = await params;
    const def = getConnectorDefinition(id);
    if (!def) {
      return NextResponse.json({ error: `Connector '${id}' not recognized` }, { status: 404 });
    }

    const body = await req.json();
    const token = body.token || body.apiKey;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return NextResponse.json({ error: 'Token string is required' }, { status: 400 });
    }

    await storeEncryptedToken(
      workspaceId,
      id as ConnectorType,
      {
        access_token: token.trim(),
        token_type: 'Bearer',
      },
      def.scopes
    );

    return NextResponse.json({ success: true, message: `${def.name} token stored securely.` });
  } catch (err: any) {
    console.error('[API /api/connectors/[id]/auth POST error]:', err);
    return NextResponse.json({ error: err.message || 'Token storage failed' }, { status: 500 });
  }
}

function respondUnconfigured(req: NextRequest, connectorId: string, message: string) {
  const isJson = req.headers.get('accept')?.includes('application/json');
  if (isJson) {
    return NextResponse.json({ error: message, code: `${connectorId}_not_configured` }, { status: 400 });
  }

  const redirectUrl = new URL('/app', req.url);
  redirectUrl.searchParams.set('section', 'sources');
  redirectUrl.searchParams.set('error', `${connectorId}_not_configured`);
  redirectUrl.searchParams.set('message', message);
  return NextResponse.redirect(redirectUrl);
}
