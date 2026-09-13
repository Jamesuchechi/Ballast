import { NextRequest } from 'next/server';

/**
 * Resolves the canonical base URL for the deployment.
 * Handles local dev, Vercel deployments, and production custom domains.
 */
export function getBaseUrl(req?: NextRequest): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  if (req?.nextUrl?.origin && !req.nextUrl.origin.includes('localhost')) {
    return req.nextUrl.origin;
  }

  if (process.env.NEXT_APP_URL && !process.env.NEXT_APP_URL.includes('localhost')) {
    return process.env.NEXT_APP_URL.replace(/\/$/, '');
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (req?.nextUrl?.origin) {
    return req.nextUrl.origin;
  }

  return process.env.NEXT_APP_URL || 'http://localhost:3000';
}

/**
 * Returns the Google Auth callback URL, dynamically matching localhost or Vercel production.
 */
export function getGoogleAuthRedirectUri(req: NextRequest): string {
  // If explicitly configured for production domain, use it
  if (process.env.GOOGLE_AUTH_REDIRECT_URI && !process.env.GOOGLE_AUTH_REDIRECT_URI.includes('localhost')) {
    return process.env.GOOGLE_AUTH_REDIRECT_URI;
  }

  // If deployed to Vercel or any non-localhost host, use current request origin
  const origin = req.nextUrl.origin;
  return `${origin}/api/auth/google/callback`;
}

/**
 * Returns the Gmail Connector callback URL, dynamically matching localhost or Vercel production.
 */
export function getGmailRedirectUri(req: NextRequest): string {
  if (process.env.GOOGLE_REDIRECT_URI && !process.env.GOOGLE_REDIRECT_URI.includes('localhost')) {
    return process.env.GOOGLE_REDIRECT_URI;
  }

  const origin = req.nextUrl.origin;
  return `${origin}/api/connectors/gmail/callback`;
}

/**
 * Returns the canonical app URL for non-request contexts (e.g. background connector sync).
 */
export function getCanonicalAppUrl(): string {
  if (process.env.NEXT_APP_URL && !process.env.NEXT_APP_URL.includes('localhost')) {
    return process.env.NEXT_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_APP_URL || 'http://localhost:3000';
}

/**
 * Returns the connector callback URL for any connector (gmail, calendar, drive, github, etc.)
 */
export function getConnectorRedirectUri(connectorId: string, req?: NextRequest): string {
  if (connectorId === 'gmail' && process.env.GOOGLE_REDIRECT_URI && !process.env.GOOGLE_REDIRECT_URI.includes('localhost')) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const base = req?.nextUrl?.origin || getCanonicalAppUrl();
  return `${base}/api/connectors/${connectorId}/callback`;
}

