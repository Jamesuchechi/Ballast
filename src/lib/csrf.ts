import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSecret } from './auth';

export const CSRF_COOKIE_NAME = 'ballast_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generates a cryptographically secure, HMAC-signed CSRF token.
 */
export function generateCsrfToken(): string {
  const rawBytes = crypto.randomBytes(24).toString('base64url');
  const secret = getSessionSecret();
  const signature = crypto.createHmac('sha256', secret).update(rawBytes).digest('base64url');
  return `${rawBytes}.${signature}`;
}

/**
 * Validates a CSRF token's HMAC signature.
 */
export function validateCsrfToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [rawBytes, signature] = parts;
  if (!rawBytes || !signature) return false;

  try {
    const secret = getSessionSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(rawBytes).digest('base64url');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

/**
 * Resolves allowed canonical origins for the request.
 */
export function getAllowedOrigins(req: NextRequest): string[] {
  const origins = new Set<string>();

  // 1. Request URL origin
  if (req.nextUrl && req.nextUrl.origin) {
    origins.add(req.nextUrl.origin.toLowerCase());
  }

  // 2. Canonical app URL from env
  const appUrl = process.env.NEXT_APP_URL || process.env.APP_URL;
  if (appUrl) {
    try {
      origins.add(new URL(appUrl).origin.toLowerCase());
    } catch {}
  }

  // 3. Host header
  const host = req.headers.get('host') || req.headers.get('x-forwarded-host');
  if (host) {
    origins.add(`http://${host}`.toLowerCase());
    origins.add(`https://${host}`.toLowerCase());
  }

  // 4. Default localhost development origins
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }

  return Array.from(origins);
}

export interface CsrfVerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates CSRF protection on incoming requests:
 * 1. Verifies Origin / Referer against allowed canonical hostnames for state-mutating methods (POST/PUT/PATCH/DELETE).
 * 2. If a CSRF token or cookie is present, verifies token cryptographic HMAC integrity.
 */
export function verifyCsrf(req: NextRequest): CsrfVerificationResult {
  const method = req.method.toUpperCase();

  // Safe HTTP methods do not mutate state
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { valid: true };
  }

  // 1. Origin / Referer Verification
  const originHeader = req.headers.get('origin');
  const refererHeader = req.headers.get('referer');
  const allowedOrigins = getAllowedOrigins(req);

  if (originHeader) {
    const normalizedOrigin = originHeader.toLowerCase().trim();
    const isAllowed = allowedOrigins.some((allowed) => normalizedOrigin === allowed || normalizedOrigin.startsWith(allowed));
    if (!isAllowed) {
      return {
        valid: false,
        error: `Cross-site request rejected: Origin '${originHeader}' is not authorized.`,
      };
    }
  } else if (refererHeader) {
    try {
      const refererOrigin = new URL(refererHeader).origin.toLowerCase();
      const isAllowed = allowedOrigins.some((allowed) => refererOrigin === allowed || refererOrigin.startsWith(allowed));
      if (!isAllowed) {
        return {
          valid: false,
          error: `Cross-site request rejected: Referer '${refererHeader}' is not authorized.`,
        };
      }
    } catch {
      return { valid: false, error: 'Malformed Referer header in mutating request.' };
    }
  }

  // 2. Double-submit CSRF token validation if header or cookie is supplied
  const headerToken = req.headers.get(CSRF_HEADER_NAME) || req.headers.get('x-ballast-csrf');
  const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (headerToken && !validateCsrfToken(headerToken)) {
    return { valid: false, error: 'Invalid or forged CSRF header token.' };
  }

  if (cookieToken && headerToken && headerToken !== cookieToken) {
    return { valid: false, error: 'CSRF token mismatch between cookie and header.' };
  }

  return { valid: true };
}

/**
 * Attaches a secure CSRF token cookie to an outgoing NextResponse.
 */
export function attachCsrfCookie(res: NextResponse, token?: string): string {
  const csrfToken = token || generateCsrfToken();
  res.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false, // Must be readable by client JS to send in x-csrf-token header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return csrfToken;
}
