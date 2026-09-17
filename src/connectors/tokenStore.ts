import crypto from 'node:crypto';
import { query, queryOne } from '@/db/client';

/**
 * Resolves the 32-byte (256-bit) AES-256-GCM encryption key.
 * Strictly prohibits hardcoded fallback keys in production (Security S1).
 */
export function getEncryptionKey(): Buffer {
  const seed = process.env.BALLAST_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!seed) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[SECURITY FATAL] BALLAST_ENCRYPTION_KEY (or SESSION_SECRET) must be set in production mode. Hardcoded fallback keys are strictly prohibited.'
      );
    }
    return crypto.createHash('sha256').update('ballast_default_aes_256_gcm_master_key_seed_2026').digest();
  }
  return crypto.createHash('sha256').update(seed).digest();
}

const ALGORITHM = 'aes-256-gcm';

export interface EncryptedPayloadEnvelope {
  iv: string;
  tag: string;
  ciphertext: string;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Produces a format: `${iv}:${tag}:${ciphertext}` (in hex).
 * Zero plaintext ever written to PostgreSQL (NFR1.2).
 */
export function encryptString(plaintext: string): string {
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${tag}:${ciphertext}`;
}

/**
 * Decrypts an AES-256-GCM encrypted envelope.
 * Verifies the authentication tag to guarantee integrity.
 */
export function decryptString(encryptedPayload: string): string {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected iv:tag:ciphertext.');
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let plaintext = decipher.update(ciphertextHex, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

export interface StoredOAuthTokenRow {
  id: string;
  workspace_id: string;
  connector: string;
  encrypted_payload: string;
  scopes: string[];
  requires_reconnect?: boolean;
  last_refreshed_at?: string | null;
  last_refresh_error?: string | null;
  revoked_at: string | null;
  created_at: string;
}

/**
 * Stores OAuth tokens encrypted at rest in oauth_tokens table.
 * If active token exists for workspace + connector, updates it.
 */
export async function storeEncryptedToken(
  workspaceId: string,
  connector: string,
  tokenData: Record<string, any>,
  scopes: string[] = []
): Promise<string> {
  const serialized = JSON.stringify(tokenData);
  const encryptedPayload = encryptString(serialized);

  const rows = await query<{ id: string }>(
    `INSERT INTO oauth_tokens (
      workspace_id, connector, encrypted_payload, scopes, requires_reconnect, last_refresh_error
    ) VALUES ($1, $2, $3, $4::jsonb, false, null)
    ON CONFLICT (workspace_id, connector) WHERE revoked_at IS NULL
    DO UPDATE SET 
      encrypted_payload = EXCLUDED.encrypted_payload,
      scopes = EXCLUDED.scopes,
      requires_reconnect = false,
      last_refresh_error = null,
      created_at = NOW()
    RETURNING id`,
    [workspaceId, connector, encryptedPayload, JSON.stringify(scopes)]
  );

  return rows[0].id;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checks if a decrypted token is expired or within 5 minutes of expiring.
 */
export function isTokenExpiredOrNearingExpiration(token: Record<string, any>): boolean {
  const BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer
  const now = Date.now();

  if (typeof token.expiry_date === 'number') {
    return token.expiry_date <= now + BUFFER_MS;
  }

  if (typeof token.expires_at === 'number') {
    const expiresAtMs = token.expires_at > 1e11 ? token.expires_at : token.expires_at * 1000;
    return expiresAtMs <= now + BUFFER_MS;
  }

  return false;
}

/**
 * Sets the connector token to requires_reconnect = true.
 */
export async function setTokenReconnectRequired(
  workspaceId: string,
  connector: string,
  errorMsg: string
): Promise<void> {
  try {
    await query(
      `UPDATE oauth_tokens 
       SET requires_reconnect = true, last_refresh_error = $1 
       WHERE workspace_id = $2 AND connector = $3 AND revoked_at IS NULL`,
      [errorMsg, workspaceId, connector]
    );
  } catch (err) {
    console.warn(`[TOKEN STORE] Failed setting requires_reconnect on ${connector}:`, err);
  }
}

/**
 * Retrieves and decrypts the raw OAuth token for a workspace connector without auto-refresh.
 */
export async function getDecryptedTokenRaw<T = Record<string, any>>(
  workspaceId: string,
  connector: string
): Promise<T | null> {
  if (!UUID_REGEX.test(workspaceId)) {
    return null;
  }

  const row = await queryOne<StoredOAuthTokenRow>(
    `SELECT * FROM oauth_tokens 
     WHERE workspace_id = $1 AND connector = $2 AND revoked_at IS NULL 
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, connector]
  );

  if (!row) {
    return null;
  }

  try {
    const plaintext = decryptString(row.encrypted_payload);
    return JSON.parse(plaintext) as T;
  } catch (err) {
    console.error(`[TOKEN STORE] Decryption failed for workspace ${workspaceId} connector ${connector}:`, err);
    return null;
  }
}

/**
 * Exchanges a provider refresh_token for a new access_token.
 * Supports Google OAuth (Gmail, Drive, Calendar) and Slack OAuth.
 * Automatically saves the updated encrypted token to PostgreSQL.
 * If the refresh token was revoked or expired, sets requires_reconnect = true.
 */
export async function refreshToken(
  workspaceId: string,
  connector: string
): Promise<Record<string, any> | null> {
  if (!UUID_REGEX.test(workspaceId)) {
    return null;
  }

  const currentToken = await getDecryptedTokenRaw(workspaceId, connector);
  if (!currentToken || !currentToken.refresh_token) {
    return null;
  }

  const isGoogle = ['gmail', 'drive', 'calendar', 'google'].includes(connector);
  const isSlack = connector === 'slack';

  try {
    if (isGoogle) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        console.warn(`[TOKEN STORE] Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET; cannot refresh ${connector} token`);
        return null;
      }

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: currentToken.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[TOKEN STORE] Google token refresh failed for workspace ${workspaceId} connector ${connector}: HTTP ${res.status} - ${errorText}`);

        if (res.status === 400 || res.status === 401 || errorText.includes('invalid_grant')) {
          await setTokenReconnectRequired(
            workspaceId,
            connector,
            'Google authorization expired or revoked. Please reconnect your account.'
          );
        }
        return null;
      }

      const data = await res.json();
      const updatedToken = {
        ...currentToken,
        access_token: data.access_token,
        token_type: data.token_type || currentToken.token_type || 'Bearer',
        expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
        expires_at: Math.floor((Date.now() + (data.expires_in || 3600) * 1000) / 1000),
      };

      await storeEncryptedToken(workspaceId, connector, updatedToken, currentToken.scopes || []);
      try {
        await query(
          `UPDATE oauth_tokens 
           SET requires_reconnect = false, last_refreshed_at = NOW(), last_refresh_error = null 
           WHERE workspace_id = $1 AND connector = $2 AND revoked_at IS NULL`,
          [workspaceId, connector]
        );
      } catch {}

      console.log(`[TOKEN STORE] Successfully refreshed Google token for workspace ${workspaceId} connector ${connector}`);
      return updatedToken;
    }

    if (isSlack) {
      const clientId = process.env.SLACK_CLIENT_ID;
      const clientSecret = process.env.SLACK_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return null;
      }

      const res = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: currentToken.refresh_token,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        console.error(`[TOKEN STORE] Slack token refresh failed for workspace ${workspaceId}:`, data.error);
        if (data.error === 'invalid_refresh_token' || data.error === 'token_revoked') {
          await setTokenReconnectRequired(
            workspaceId,
            connector,
            'Slack authorization expired or revoked. Please reconnect your workspace.'
          );
        }
        return null;
      }

      const updatedToken = {
        ...currentToken,
        access_token: data.access_token,
        refresh_token: data.refresh_token || currentToken.refresh_token,
        expires_in: data.expires_in,
        expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      };

      await storeEncryptedToken(workspaceId, connector, updatedToken, currentToken.scopes || []);
      try {
        await query(
          `UPDATE oauth_tokens 
           SET requires_reconnect = false, last_refreshed_at = NOW(), last_refresh_error = null 
           WHERE workspace_id = $1 AND connector = $2 AND revoked_at IS NULL`,
          [workspaceId, connector]
        );
      } catch {}

      console.log(`[TOKEN STORE] Successfully refreshed Slack token for workspace ${workspaceId}`);
      return updatedToken;
    }

    return null;
  } catch (err: any) {
    console.error(`[TOKEN STORE] Exception during token refresh for ${connector}:`, err);
    return null;
  }
}

/**
 * Retrieves and decrypts the active OAuth token for a workspace connector.
 * Automatically refreshes expiring tokens if a refresh token is present.
 * Returns null if token does not exist or has been revoked (FR1.3).
 */
export async function getDecryptedToken<T = Record<string, any>>(
  workspaceId: string,
  connector: string,
  options: { autoRefresh?: boolean } = { autoRefresh: true }
): Promise<T | null> {
  const token = await getDecryptedTokenRaw<T>(workspaceId, connector);
  if (!token) {
    return null;
  }

  // If autoRefresh is enabled and token has a refresh_token and is expiring
  if (
    options.autoRefresh &&
    (token as any).refresh_token &&
    isTokenExpiredOrNearingExpiration(token as any)
  ) {
    const refreshed = await refreshToken(workspaceId, connector);
    if (refreshed) {
      return refreshed as unknown as T;
    }
  }

  return token;
}

/**
 * Marks a connector token revoked_at = NOW(), halting all future sync runs (FR1.3).
 */
export async function revokeToken(workspaceId: string, connector: string): Promise<boolean> {
  const res = await query<{ id: string }>(
    `UPDATE oauth_tokens 
     SET revoked_at = NOW() 
     WHERE workspace_id = $1 AND connector = $2 AND revoked_at IS NULL
     RETURNING id`,
    [workspaceId, connector]
  );
  return res.length > 0;
}

/**
 * Gets high-level token status without exposing credentials.
 */
export async function getTokenStatus(
  workspaceId: string,
  connector: string
): Promise<{
  connected: boolean;
  revoked: boolean;
  requires_reconnect: boolean;
  scopes: string[];
  created_at?: string;
  revoked_at?: string;
  last_refreshed_at?: string;
  last_refresh_error?: string;
}> {
  if (!UUID_REGEX.test(workspaceId)) {
    return { connected: false, revoked: false, requires_reconnect: false, scopes: [] };
  }

  const row = await queryOne<{
    id: string;
    scopes: string[];
    requires_reconnect: boolean;
    last_refreshed_at: string | null;
    last_refresh_error: string | null;
    revoked_at: string | null;
    created_at: string;
  }>(
    `SELECT 
       id, 
       scopes, 
       COALESCE((to_jsonb(t.*) ->> 'requires_reconnect')::boolean, false) as requires_reconnect,
       (to_jsonb(t.*) ->> 'last_refreshed_at') as last_refreshed_at,
       (to_jsonb(t.*) ->> 'last_refresh_error') as last_refresh_error,
       revoked_at, 
       created_at 
     FROM oauth_tokens t
     WHERE workspace_id = $1 AND connector = $2 
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, connector]
  );

  if (!row) {
    return { connected: false, revoked: false, requires_reconnect: false, scopes: [] };
  }

  const isRevoked = Boolean(row.revoked_at);
  const requiresReconnect = Boolean(row.requires_reconnect);

  return {
    connected: !isRevoked && !requiresReconnect,
    revoked: isRevoked,
    requires_reconnect: requiresReconnect,
    scopes: row.scopes || [],
    created_at: row.created_at,
    revoked_at: row.revoked_at || undefined,
    last_refreshed_at: row.last_refreshed_at || undefined,
    last_refresh_error: row.last_refresh_error || undefined,
  };
}
