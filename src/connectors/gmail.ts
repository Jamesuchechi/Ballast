import { createHash } from 'node:crypto';
import { google } from 'googleapis';
import { query, queryOne } from '@/db/client';
import { chunkAndEmbedText } from '@/core/embeddings';
import { getDecryptedToken, revokeToken, getTokenStatus, storeEncryptedToken } from './tokenStore';
import type {
  SourceConnector,
  ConnectorHealth,
  SyncOptions,
  SyncItem,
  FetchedDocument,
  SyncResult,
} from './types';

export interface GmailMessagePayload {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}

export const DEFAULT_SYNC_WINDOW_DAYS = 90;

export function formatEmailContent(m: GmailMessagePayload): string {
  return `Subject: ${m.subject}\nFrom: ${m.from}\nDate: ${m.date}\nThread-ID: ${m.threadId}\n\n${m.body}`;
}

/**
 * Built-in representative mock messages used strictly for offline evaluation,
 * local CI runs, and testing when EVAL_USE_MOCK=true or NODE_ENV=test.
 */
export const SAMPLE_GMAIL_MESSAGES: GmailMessagePayload[] = [
  {
    id: 'gmail-msg-101',
    threadId: 'thread-q3-billing',
    subject: 'Re: Q3 Billing & Stripe Webhook Deployment',
    from: 'alex.chen@acme.corp',
    date: new Date(Date.now() - 2 * 86400000).toISOString(),
    body: `Hi team,
Regarding what is on our plate this week:
1. Alex needs to confirm merchant accounts configuration in the new Stripe dashboard by Wednesday.
2. The Stripe webhook handler is deployed to staging and passing tests.
3. Elena from legal needs to give final compliance review before auto-debit can be enabled.
Let's get this wrapped up for the Friday deployment window.`,
  },
  {
    id: 'gmail-msg-102',
    threadId: 'thread-compliance-sync',
    subject: 'Legal review sign-off status',
    from: 'elena.rostova@legal.corp',
    date: new Date(Date.now() - 4 * 86400000).toISOString(),
    body: `Quick update on the billing review:
We are currently evaluating the auto-debit consent wording for EU customers.
Elena is pending review until the revised terms of service are published on staging.
No production auto-debit should occur before written sign-off.`,
  },
  {
    id: 'gmail-msg-103',
    threadId: 'thread-db-replica',
    subject: 'Database migration dry run on replica',
    from: 'devops-alerts@internal.corp',
    date: new Date(Date.now() - 7 * 86400000).toISOString(),
    body: `Migration dry run scheduled:
Database migration scripts for subscriber tiers are ready.
DevOps recommended running on the read replica first before applying to production master.`,
  },
];

/**
 * Helper to recursively extract plain text or stripped HTML from a Gmail message payload.
 */
function extractEmailBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf8');
  }
  if (payload.parts && Array.isArray(payload.parts)) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, 'base64url').toString('utf8');
    }
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
    if (htmlPart?.body?.data) {
      const html = Buffer.from(htmlPart.body.data, 'base64url').toString('utf8');
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    for (const part of payload.parts) {
      const nested = extractEmailBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

/**
 * Initializes authenticated Google OAuth2 client using decrypted tokens.
 * Handles automatic token refresh and encrypted re-persistence in PostgreSQL.
 */
export async function getAuthenticatedGmailClient(workspaceId: string) {
  const token = await getDecryptedToken<Record<string, any>>(workspaceId, 'gmail');
  if (!token || !token.access_token) {
    throw new Error('Gmail connector is not connected or token has been revoked (FR1.3)');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${(process.env.NEXT_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')).replace(/\/$/, '')}/api/connectors/gmail/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expiry_date: token.expiry_date,
    token_type: token.token_type || 'Bearer',
    scope: Array.isArray(token.scopes) ? token.scopes.join(' ') : token.scope,
  });

  oauth2Client.on('tokens', async (refreshedTokens) => {
    try {
      const updated = { ...token, ...refreshedTokens };
      await storeEncryptedToken(workspaceId, 'gmail', updated, token.scopes || []);
    } catch (e) {
      console.error(`[GMAIL TOKEN REFRESH ERROR for workspace ${workspaceId}]:`, e);
    }
  });

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    token,
    oauth2Client,
  };
}

export class GmailConnector implements SourceConnector {
  readonly id = 'gmail' as const;
  readonly name = 'Gmail';

  /**
   * Retrieves connection health and status from database (FR2.5).
   */
  async health(workspaceId: string): Promise<ConnectorHealth> {
    const tokenStatus = await getTokenStatus(workspaceId, 'gmail');

    const sourceStats = await queryOne<{
      last_synced: string | null;
      last_error: string | null;
    }>(
      `SELECT MAX(synced_at) AS last_synced,
              (SELECT last_error FROM sources WHERE workspace_id = $1 AND connector = 'gmail' AND last_error IS NOT NULL ORDER BY synced_at DESC LIMIT 1) AS last_error
       FROM sources 
       WHERE workspace_id = $1 AND connector = 'gmail'`,
      [workspaceId]
    );

    return {
      connected: tokenStatus.connected,
      last_synced: sourceStats?.last_synced || null,
      last_error: tokenStatus.last_refresh_error || sourceStats?.last_error || null,
      sync_window_days: DEFAULT_SYNC_WINDOW_DAYS,
      revoked_at: tokenStatus.revoked_at,
      requires_reconnect: tokenStatus.requires_reconnect,
      last_refresh_error: tokenStatus.last_refresh_error,
    };
  }

  /**
   * Lists changes within the configured sync window (default 90 days) (FR2.1).
   * Makes real API calls to Google Gmail messages.list.
   */
  async list_changes(options: SyncOptions): Promise<SyncItem[]> {
    const { workspaceId, windowDays = DEFAULT_SYNC_WINDOW_DAYS, simulateRateLimit, simulateError, maxResults = 50 } = options;

    if (simulateRateLimit) {
      throw new Error('Gmail API rate limit exceeded (HTTP 429)');
    }

    if (simulateError) {
      throw new Error('Gmail API service temporarily unavailable (HTTP 503)');
    }

    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
    const cutoffDate = new Date(Date.now() - windowDays * 86400000);

    // If explicit mock mode and no active real token exists, return sample fixtures
    const existingToken = await getDecryptedToken(workspaceId, 'gmail');
    if (!existingToken && isMockAllowed) {
      const messages = SAMPLE_GMAIL_MESSAGES.filter(
        (m) => new Date(m.date) >= cutoffDate
      );
      return messages.map((m) => {
        const content = formatEmailContent(m);
        const checksum = createHash('sha256').update(content).digest('hex');
        return {
          externalId: m.id,
          checksum,
          date: m.date,
          subject: m.subject,
          snippet: m.body.slice(0, 100),
        };
      });
    }

    if (!existingToken) {
      throw new Error('Gmail connector is not connected or token has been revoked (FR1.3)');
    }

    // Live Gmail API Call
    const { gmail } = await getAuthenticatedGmailClient(workspaceId);
    const afterEpochSeconds = Math.floor(cutoffDate.getTime() / 1000);
    const queryStr = `after:${afterEpochSeconds}`;

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: queryStr,
      maxResults,
    });

    const messages = listRes.data.messages || [];
    const items: SyncItem[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      // Fetch headers and snippet
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'Date', 'From'],
        });

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || 'No Subject';
        const dateStr = headers.find((h) => h.name?.toLowerCase() === 'date')?.value || new Date().toISOString();
        const snippet = detail.data.snippet || '';

        // Temporary initial checksum from metadata; full content checksum finalized on fetch
        const checksum = createHash('sha256').update(`${msg.id}:${subject}:${dateStr}:${snippet}`).digest('hex');

        items.push({
          externalId: msg.id,
          checksum,
          date: new Date(dateStr).toISOString(),
          subject,
          snippet,
        });
      } catch (err: any) {
        console.warn(`[GMAIL LIST_CHANGES] Failed fetching metadata for message ${msg.id}:`, err.message);
      }
    }

    return items;
  }

  /**
   * Fetches full email document content from Gmail API.
   */
  async fetch(workspaceId: string, externalId: string): Promise<FetchedDocument> {
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';

    if (externalId.startsWith('gmail-msg-') && isMockAllowed) {
      const msg = SAMPLE_GMAIL_MESSAGES.find((m) => m.id === externalId);
      if (msg) {
        const content = formatEmailContent(msg);
        const checksum = createHash('sha256').update(content).digest('hex');
        return {
          externalId: msg.id,
          content,
          checksum,
          date: msg.date,
          meta: {
            subject: msg.subject,
            from: msg.from,
            threadId: msg.threadId,
            date: msg.date,
          },
        };
      }
    }

    const { gmail } = await getAuthenticatedGmailClient(workspaceId);
    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id: externalId,
      format: 'full',
    });

    const data = msgRes.data;
    const headers = data.payload?.headers || [];
    const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || 'No Subject';
    const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || 'Unknown Sender';
    const rawDate = headers.find((h) => h.name?.toLowerCase() === 'date')?.value || new Date().toISOString();
    const date = new Date(rawDate).toISOString();
    const body = extractEmailBody(data.payload) || data.snippet || '';

    const payload: GmailMessagePayload = {
      id: externalId,
      threadId: data.threadId || externalId,
      subject,
      from,
      date,
      body,
    };

    const content = formatEmailContent(payload);
    const checksum = createHash('sha256').update(content).digest('hex');

    return {
      externalId,
      content,
      checksum,
      date,
      meta: {
        subject,
        from,
        threadId: payload.threadId,
        date,
      },
    };
  }

  /**
   * Incremental sync with 90-day window, SHA-256 deduplication, and untrusted boundaries.
   */
  async sync(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const { workspaceId, windowDays = DEFAULT_SYNC_WINDOW_DAYS } = options;

    try {
      const items = await this.list_changes(options);
      let syncedCount = 0;
      let unchangedCount = 0;
      const syncWindowStart = new Date(Date.now() - windowDays * 86400000).toISOString();

      for (const item of items) {
        // Check for deduplication by external_id (FR2.10, Task D3)
        const existing = await queryOne<{ id: string; checksum: string }>(
          `SELECT id, checksum FROM sources 
           WHERE workspace_id = $1 AND connector = 'gmail' AND external_id = $2`,
          [workspaceId, item.externalId]
        );

        if (existing) {
          if (existing.checksum === item.checksum) {
            await query(
              `UPDATE sources 
               SET synced_at = NOW(), sync_window_start = $2 
               WHERE id = $1`,
              [existing.id, syncWindowStart]
            );
            unchangedCount++;
          } else {
            // Document content updated: re-fetch, update source, replace old chunks
            const doc = await this.fetch(workspaceId, item.externalId);
            await query(
              `UPDATE sources 
               SET checksum = $2, meta = $3::jsonb, synced_at = NOW(), sync_window_start = $4 
               WHERE id = $1`,
              [existing.id, doc.checksum, JSON.stringify(doc.meta), syncWindowStart]
            );
            await query(`DELETE FROM chunks WHERE source_id = $1`, [existing.id]);
            await chunkAndEmbedText({
              workspaceId,
              sourceId: existing.id,
              text: doc.content,
              sourceName: doc.meta.subject || doc.externalId,
            });
            syncedCount++;
          }
        } else {
          // Fetch document content from live API or sample
          const doc = await this.fetch(workspaceId, item.externalId);

          // Store with trust_boundary='untrusted_content' (FR3.5, NFR1.1)
          const insertRes = await query<{ id: string }>(
            `INSERT INTO sources (
              workspace_id, connector, external_id, checksum, trust_boundary,
              sync_window_start, synced_at, meta
            ) VALUES ($1, 'gmail', $2, $3, 'untrusted_content', $4, NOW(), $5::jsonb)
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

          // Chunk and embed into PostgreSQL pgvector
          await chunkAndEmbedText({
            workspaceId,
            sourceId,
            text: doc.content,
            sourceName: doc.meta.subject || doc.externalId,
          });

          syncedCount++;
        }
      }

      // Record access_logs entry for sync auditing (NFR2.4)
      await query(
        `INSERT INTO access_logs (
          workspace_id, source_id, brief_id, action
        ) VALUES ($1, null, null, $2)`,
        [
          workspaceId,
          `gmail_sync: window=${windowDays}d synced=${syncedCount} unchanged=${unchangedCount}`,
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
      const errorMessage = err.message || 'Gmail sync failed';

      // Record error on sources
      await query(
        `UPDATE sources SET last_error = $2 WHERE workspace_id = $1 AND connector = 'gmail'`,
        [workspaceId, errorMessage]
      );

      // Record failure audit log
      await query(
        `INSERT INTO access_logs (
          workspace_id, source_id, brief_id, action
        ) VALUES ($1, null, null, $2)`,
        [workspaceId, `gmail_sync_error: ${errorMessage}`]
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

  /**
   * Revokes connector access and stops future sync (FR1.3).
   */
  async revoke(workspaceId: string): Promise<void> {
    await revokeToken(workspaceId, 'gmail');
    await query(
      `INSERT INTO access_logs (
        workspace_id, source_id, brief_id, action
      ) VALUES ($1, null, null, 'gmail_revoked')`,
      [workspaceId]
    );
  }
}

export const gmailConnector = new GmailConnector();
