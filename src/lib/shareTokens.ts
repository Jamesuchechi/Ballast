import crypto from 'node:crypto';
import { getSessionSecret } from './auth';

export interface ShareTokenPayload {
  briefId: string;
  workspaceId: string;
  exp: number; // Unix timestamp in seconds
  type: 'read_only_brief';
}

/**
 * Creates an expiring HMAC-SHA256 signed share token for a specific brief.
 * Format: `${base64Payload}.${signature}`
 */
export function createShareToken(
  briefId: string,
  workspaceId: string,
  expiresInHours = 72
): { token: string; expiresAt: string; exp: number } {
  const secret = getSessionSecret();
  const exp = Math.floor(Date.now() / 1000) + expiresInHours * 3600;

  const payload: ShareTokenPayload = {
    briefId,
    workspaceId,
    exp,
    type: 'read_only_brief',
  };

  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const token = `${data}.${sig}`;
  const expiresAt = new Date(exp * 1000).toISOString();

  return { token, expiresAt, exp };
}

/**
 * Verifies a share token's HMAC-SHA256 signature and validates expiration.
 * Uses constant-time comparison to prevent timing side-channel attacks.
 */
export function verifyShareToken(token: string): ShareTokenPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [data, sig] = parts;
    const secret = getSessionSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

    const sigBuffer = Buffer.from(sig);
    const expectedBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expectedBuffer.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as ShareTokenPayload;

    if (payload.type !== 'read_only_brief') {
      return null;
    }

    if (!payload.briefId || !payload.workspaceId || !payload.exp) {
      return null;
    }

    // Check expiration
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < nowInSeconds) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}
