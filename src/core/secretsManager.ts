import {
  storeEncryptedToken,
  getDecryptedToken,
  revokeToken,
  getTokenStatus,
  encryptString,
  decryptString,
} from '@/connectors/tokenStore';
import { query, queryOne } from '@/db/client';

export interface SecretMetadata {
  id: string;
  workspaceId: string;
  connector: string;
  scopes: string[];
  createdAt: string;
  revokedAt?: string | null;
}

/**
 * SecretsManager provides centralized, encrypted secret management (NFR1.2).
 * - Zero plaintext tokens ever persisted or logged.
 * - AES-256-GCM envelope encryption at rest.
 * - Safe token inspection without credential exposure.
 * - Audited revocation and token rotation.
 */
export class SecretsManager {
  /**
   * Stores or updates an encrypted OAuth token or connector secret.
   */
  async setToken(
    workspaceId: string,
    connector: string,
    tokenData: Record<string, any>,
    scopes: string[] = []
  ): Promise<string> {
    const tokenId = await storeEncryptedToken(workspaceId, connector, tokenData, scopes);

    // Audit log for secret storage (without logging plaintext tokens)
    await query(
      `INSERT INTO access_logs (workspace_id, action)
       VALUES ($1, $2)`,
      [workspaceId, `token_stored:${connector}`]
    );

    return tokenId;
  }

  /**
   * Retrieves and decrypts the active token for authorized runtime usage.
   */
  async getToken<T = Record<string, any>>(
    workspaceId: string,
    connector: string
  ): Promise<T | null> {
    const token = await getDecryptedToken<T>(workspaceId, connector);
    return token;
  }

  /**
   * Safe status check: returns connection status and scopes without exposing plaintext credentials.
   */
  async getStatus(workspaceId: string, connector: string) {
    return getTokenStatus(workspaceId, connector);
  }

  /**
   * Rotates an existing token with new credentials (NFR1.2).
   */
  async rotateToken(
    workspaceId: string,
    connector: string,
    newTokenData: Record<string, any>,
    scopes: string[] = []
  ): Promise<string> {
    const tokenId = await storeEncryptedToken(workspaceId, connector, newTokenData, scopes);

    await query(
      `INSERT INTO access_logs (workspace_id, action)
       VALUES ($1, $2)`,
      [workspaceId, `token_rotated:${connector}`]
    );

    return tokenId;
  }

  /**
   * Revokes connector tokens, halting sync runs immediately.
   */
  async revoke(workspaceId: string, connector: string): Promise<boolean> {
    const success = await revokeToken(workspaceId, connector);
    if (success) {
      await query(
        `INSERT INTO access_logs (workspace_id, action)
         VALUES ($1, $2)`,
        [workspaceId, `token_revoked:${connector}`]
      );
    }
    return success;
  }

  /**
   * Encrypts an arbitrary sensitive string (e.g. webhook secret, external API key).
   */
  encryptPayload(plaintext: string): string {
    return encryptString(plaintext);
  }

  /**
   * Decrypts an envelope-encrypted sensitive string.
   */
  decryptPayload(encryptedPayload: string): string {
    return decryptString(encryptedPayload);
  }
}

export const secretsManager = new SecretsManager();
