import { createHash } from 'node:crypto';
import { google } from 'googleapis';
import { query, queryOne } from '@/db/client';
import { chunkAndEmbedText } from '@/core/embeddings';
import { getDecryptedToken, revokeToken, getTokenStatus, storeEncryptedToken } from './tokenStore';
import { getConnectorRedirectUri } from '@/lib/url';
import type {
  SourceConnector,
  ConnectorHealth,
  SyncOptions,
  SyncItem,
  FetchedDocument,
  SyncResult,
} from './types';

export const DEFAULT_DRIVE_WINDOW_DAYS = 90;

export interface DriveDocPayload {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  content: string;
}

export const SAMPLE_DRIVE_FILES: DriveDocPayload[] = [
  {
    id: 'drive-file-301',
    name: 'Q3_Merchant_Requirements_v2.md',
    mimeType: 'text/markdown',
    modifiedTime: new Date(Date.now() - 3 * 86400000).toISOString(),
    content: `# Merchant Account Specifications & Compliance
1. Requirements for Stripe Dashboard Migration:
   - Primary owner Alex Chen must enable dual-control authorization.
   - Webhook endpoints must be verified with signature validation.
2. Compliance Sign-off:
   - Legal review is conducted by Elena Rostova.`,
  },
];

export async function getDriveToken(
  workspaceId: string
): Promise<{ token: Record<string, any>; tokenConnector: string } | null> {
  const driveToken = await getDecryptedToken<Record<string, any>>(workspaceId, 'drive');
  if (driveToken && driveToken.access_token) {
    return { token: driveToken, tokenConnector: 'drive' };
  }

  // Fallback to gmail token ONLY if it has drive scopes
  const gmailStatus = await getTokenStatus(workspaceId, 'gmail');
  if (gmailStatus.connected && gmailStatus.scopes?.some((s) => s.includes('drive'))) {
    const gmailToken = await getDecryptedToken<Record<string, any>>(workspaceId, 'gmail');
    if (gmailToken && gmailToken.access_token) {
      return { token: gmailToken, tokenConnector: 'gmail' };
    }
  }

  return null;
}

export async function getAuthenticatedDriveClient(workspaceId: string) {
  const tokenInfo = await getDriveToken(workspaceId);

  if (!tokenInfo) {
    throw new Error('Google Drive connector is not connected. Please connect Google Drive with drive permissions.');
  }

  const { token, tokenConnector } = tokenInfo;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getConnectorRedirectUri('drive');

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.expiry_date,
    token_type: token.token_type || 'Bearer',
  });

  oauth2Client.on('tokens', async (refreshed) => {
    try {
      const merged = { ...token, ...refreshed };
      await storeEncryptedToken(workspaceId, tokenConnector, merged, token.scopes || []);
    } catch (e) {
      console.error(`[DRIVE TOKEN REFRESH ERROR for workspace ${workspaceId}]:`, e);
    }
  });

  return {
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
    token,
  };
}

export class DriveConnector implements SourceConnector {
  readonly id = 'drive' as const;
  readonly name = 'Google Drive';

  async health(workspaceId: string): Promise<ConnectorHealth> {
    const driveStatus = await getTokenStatus(workspaceId, 'drive');
    let isConnected = driveStatus.connected;
    let revokedAt = driveStatus.revoked_at;
    let requiresReconnect = driveStatus.requires_reconnect;
    let lastRefreshError = driveStatus.last_refresh_error;

    if (!isConnected && !requiresReconnect) {
      const gmailStatus = await getTokenStatus(workspaceId, 'gmail');
      if (gmailStatus.connected && gmailStatus.scopes?.some((s) => s.includes('drive'))) {
        isConnected = true;
        revokedAt = gmailStatus.revoked_at;
        requiresReconnect = gmailStatus.requires_reconnect;
        lastRefreshError = gmailStatus.last_refresh_error;
      }
    }

    const sourceStats = await queryOne<{
      last_synced: string | null;
      last_error: string | null;
    }>(
      `SELECT MAX(synced_at) AS last_synced,
              (SELECT last_error FROM sources WHERE workspace_id = $1 AND connector = 'drive' AND last_error IS NOT NULL ORDER BY synced_at DESC LIMIT 1) AS last_error
       FROM sources 
       WHERE workspace_id = $1 AND connector = 'drive'`,
      [workspaceId]
    );

    return {
      connected: isConnected,
      last_synced: sourceStats?.last_synced || null,
      last_error: lastRefreshError || sourceStats?.last_error || null,
      sync_window_days: DEFAULT_DRIVE_WINDOW_DAYS,
      revoked_at: revokedAt,
      requires_reconnect: requiresReconnect,
      last_refresh_error: lastRefreshError,
    };
  }

  async list_changes(options: SyncOptions): Promise<SyncItem[]> {
    const { workspaceId, windowDays = DEFAULT_DRIVE_WINDOW_DAYS, maxResults = 50 } = options;
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
    const cutoffDate = new Date(Date.now() - windowDays * 86400000);

    const tokenInfo = await getDriveToken(workspaceId);

    if (!tokenInfo && isMockAllowed) {
      return SAMPLE_DRIVE_FILES.map((f) => {
        const checksum = createHash('sha256').update(f.content).digest('hex');
        return {
          externalId: f.id,
          checksum,
          date: f.modifiedTime,
          subject: f.name,
          snippet: f.content.slice(0, 100),
        };
      });
    }

    if (!tokenInfo) {
      throw new Error('Google Drive connector is not connected. Please connect Google Drive with drive permissions.');
    }

    const { drive } = await getAuthenticatedDriveClient(workspaceId);
    const queryStr = `modifiedTime >= '${cutoffDate.toISOString()}' and trashed = false`;

    const res = await drive.files.list({
      q: queryStr,
      fields: 'files(id, name, mimeType, modifiedTime, size)',
      pageSize: maxResults,
    });

    const items: SyncItem[] = [];
    for (const f of res.data.files || []) {
      if (!f.id) continue;
      const name = f.name || 'Untitled Document';
      const modifiedTime = f.modifiedTime || new Date().toISOString();
      const checksum = createHash('sha256').update(`${f.id}:${name}:${modifiedTime}`).digest('hex');

      items.push({
        externalId: f.id,
        checksum,
        date: modifiedTime,
        subject: name,
        snippet: `Google Drive file: ${name} (${f.mimeType || 'unknown'})`,
      });
    }

    return items;
  }

  async fetch(workspaceId: string, externalId: string): Promise<FetchedDocument> {
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';

    if (externalId.startsWith('drive-file-') && isMockAllowed) {
      const f = SAMPLE_DRIVE_FILES.find((doc) => doc.id === externalId);
      if (f) {
        const checksum = createHash('sha256').update(f.content).digest('hex');
        return {
          externalId: f.id,
          content: f.content,
          checksum,
          date: f.modifiedTime,
          meta: { name: f.name, mimeType: f.mimeType },
        };
      }
    }

    const { drive } = await getAuthenticatedDriveClient(workspaceId);
    const fileMeta = await drive.files.get({
      fileId: externalId,
      fields: 'id, name, mimeType, modifiedTime',
    });

    const name = fileMeta.data.name || 'Untitled Document';
    const mimeType = fileMeta.data.mimeType || '';
    const date = fileMeta.data.modifiedTime || new Date().toISOString();

    let content = '';
    if (mimeType === 'application/vnd.google-apps.document') {
      const exported = await drive.files.export({
        fileId: externalId,
        mimeType: 'text/plain',
      });
      content = typeof exported.data === 'string' ? exported.data : JSON.stringify(exported.data);
    } else {
      try {
        const media = await drive.files.get({
          fileId: externalId,
          alt: 'media',
        });
        content = typeof media.data === 'string' ? media.data : JSON.stringify(media.data);
      } catch {
        content = `File metadata: ${name} (${mimeType})`;
      }
    }

    const fullContent = `Document: ${name}\nModified: ${date}\nType: ${mimeType}\n\n${content}`;
    const checksum = createHash('sha256').update(fullContent).digest('hex');

    return {
      externalId,
      content: fullContent,
      checksum,
      date,
      meta: {
        name,
        mimeType,
        date,
      },
    };
  }

  async sync(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const { workspaceId, windowDays = DEFAULT_DRIVE_WINDOW_DAYS } = options;

    try {
      const items = await this.list_changes(options);
      let syncedCount = 0;
      let unchangedCount = 0;
      const syncWindowStart = new Date(Date.now() - windowDays * 86400000).toISOString();

      for (const item of items) {
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM sources 
           WHERE workspace_id = $1 AND connector = 'drive' AND checksum = $2`,
          [workspaceId, item.checksum]
        );

        if (existing) {
          await query(
            `UPDATE sources 
             SET synced_at = NOW(), sync_window_start = $2 
             WHERE id = $1`,
            [existing.id, syncWindowStart]
          );
          unchangedCount++;
        } else {
          const doc = await this.fetch(workspaceId, item.externalId);

          const insertRes = await query<{ id: string }>(
            `INSERT INTO sources (
              workspace_id, connector, external_id, checksum, trust_boundary,
              sync_window_start, synced_at, meta
            ) VALUES ($1, 'drive', $2, $3, 'untrusted_content', $4, NOW(), $5::jsonb)
            RETURNING id`,
            [
              workspaceId,
              doc.externalId,
              doc.checksum,
              syncWindowStart,
              JSON.stringify(doc.meta),
            ]
          );

          const sourceId = insertRes[0].id;
          await chunkAndEmbedText({
            workspaceId,
            sourceId,
            text: doc.content,
            sourceName: doc.meta.name || doc.externalId,
          });

          syncedCount++;
        }
      }

      await query(
        `INSERT INTO access_logs (
          workspace_id, source_id, brief_id, action
        ) VALUES ($1, null, null, $2)`,
        [
          workspaceId,
          `drive_sync: window=${windowDays}d synced=${syncedCount} unchanged=${unchangedCount}`,
        ]
      );

      return {
        syncedCount,
        unchangedCount,
        windowDays,
        durationMs: Date.now() - startTime,
        error: null,
      };
    } catch (err: any) {
      const errorMessage = err.message || 'Drive sync failed';

      await query(
        `UPDATE sources SET last_error = $2 WHERE workspace_id = $1 AND connector = 'drive'`,
        [workspaceId, errorMessage]
      );

      await query(
        `INSERT INTO access_logs (
          workspace_id, source_id, brief_id, action
        ) VALUES ($1, null, null, $2)`,
        [workspaceId, `drive_sync_error: ${errorMessage}`]
      );

      return {
        syncedCount: 0,
        unchangedCount: 0,
        windowDays,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  async revoke(workspaceId: string): Promise<void> {
    await revokeToken(workspaceId, 'drive');
    await query(
      `INSERT INTO access_logs (
        workspace_id, source_id, brief_id, action
      ) VALUES ($1, null, null, 'drive_revoked')`,
      [workspaceId]
    );
  }
}

export const driveConnector = new DriveConnector();
