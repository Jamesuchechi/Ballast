import crypto from 'node:crypto';
import { query, queryOne } from '@/db/client';

const MASTER_KEY_SEED =
  process.env.BALLAST_ENCRYPTION_KEY ||
  process.env.SESSION_SECRET ||
  'ballast_default_aes_256_gcm_master_key_seed_2026';

// Derive deterministic 32-byte (256-bit) key for AES-256-GCM
const ENCRYPTION_KEY = crypto.createHash('sha256').update(MASTER_KEY_SEED).digest();
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
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

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

  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
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

  // Check if existing token row exists
  const existing = await queryOne<StoredOAuthTokenRow>(
    `SELECT id FROM oauth_tokens WHERE workspace_id = $1 AND connector = $2 AND revoked_at IS NULL`,
    [workspaceId, connector]
  );

  if (existing) {
    await query(
      `UPDATE oauth_tokens 
       SET encrypted_payload = $1, scopes = $2::jsonb, created_at = NOW() 
       WHERE id = $3`,
      [encryptedPayload, JSON.stringify(scopes), existing.id]
    );
    return existing.id;
  } else {
    const rows = await query<{ id: string }>(
      `INSERT INTO oauth_tokens (
        workspace_id, connector, encrypted_payload, scopes
      ) VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
      [workspaceId, connector, encryptedPayload, JSON.stringify(scopes)]
    );
    return rows[0].id;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retrieves and decrypts the active OAuth token for a workspace connector.
 * Returns null if token does not exist or has been revoked (FR1.3).
 */
export async function getDecryptedToken<T = Record<string, any>>(
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
  scopes: string[];
  created_at?: string;
  revoked_at?: string;
}> {
  if (!UUID_REGEX.test(workspaceId)) {
    return { connected: false, revoked: false, scopes: [] };
  }

  const row = await queryOne<StoredOAuthTokenRow>(
    `SELECT * FROM oauth_tokens 
     WHERE workspace_id = $1 AND connector = $2 
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, connector]
  );

  if (!row) {
    return { connected: false, revoked: false, scopes: [] };
  }

  const isRevoked = Boolean(row.revoked_at);
  return {
    connected: !isRevoked,
    revoked: isRevoked,
    scopes: row.scopes || [],
    created_at: row.created_at,
    revoked_at: row.revoked_at || undefined,
  };
}
