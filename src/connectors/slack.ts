import { createHash } from 'node:crypto';
import { query, queryOne } from '@/db/client';
import { chunkAndEmbedText } from '@/core/embeddings';
import { getDecryptedToken, revokeToken, getTokenStatus } from './tokenStore';
import type {
  SourceConnector,
  ConnectorHealth,
  SyncOptions,
  SyncItem,
  FetchedDocument,
  SyncResult,
} from './types';

export const DEFAULT_SLACK_WINDOW_DAYS = 30;

export interface SlackMessagePayload {
  id: string;
  channel: string;
  user: string;
  ts: string;
  text: string;
}

export const SAMPLE_SLACK_MESSAGES: SlackMessagePayload[] = [
  {
    id: 'slack-msg-501',
    channel: '#eng-deployments',
    user: 'alex.chen',
    ts: new Date(Date.now() - 1 * 86400000).toISOString(),
    text: 'Stripe webhook listener has been deployed to staging. Awaiting legal sign-off from Elena before enabling auto-debit.',
  },
  {
    id: 'slack-msg-502',
    channel: '#legal-sync',
    user: 'elena.rostova',
    ts: new Date(Date.now() - 2 * 86400000).toISOString(),
    text: 'We are updating the terms of service document for auto-debit consent. ETA for written sign-off is by Wednesday.',
  },
];

export class SlackConnector implements SourceConnector {
  readonly id = 'slack' as const;
  readonly name = 'Slack';

  async health(workspaceId: string): Promise<ConnectorHealth> {
    const tokenStatus = await getTokenStatus(workspaceId, 'slack');

    const sourceStats = await queryOne<{
      last_synced: string | null;
      last_error: string | null;
    }>(
      `SELECT MAX(synced_at) AS last_synced,
              (SELECT last_error FROM sources WHERE workspace_id = $1 AND connector = 'slack' AND last_error IS NOT NULL ORDER BY synced_at DESC LIMIT 1) AS last_error
       FROM sources 
       WHERE workspace_id = $1 AND connector = 'slack'`,
      [workspaceId]
    );

    return {
      connected: tokenStatus.connected,
      last_synced: sourceStats?.last_synced || null,
      last_error: tokenStatus.last_refresh_error || sourceStats?.last_error || null,
      sync_window_days: DEFAULT_SLACK_WINDOW_DAYS,
      revoked_at: tokenStatus.revoked_at,
      requires_reconnect: tokenStatus.requires_reconnect,
      last_refresh_error: tokenStatus.last_refresh_error,
    };
  }

  async list_changes(options: SyncOptions): Promise<SyncItem[]> {
    const { workspaceId, windowDays = DEFAULT_SLACK_WINDOW_DAYS, maxResults = 50 } = options;
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
    const cutoffDate = new Date(Date.now() - windowDays * 86400000);

    const token = await getDecryptedToken<{
      access_token?: string;
      token?: string;
      authed_user?: { access_token?: string; id?: string };
    }>(workspaceId, 'slack');

    const bearerToken = token?.authed_user?.access_token || token?.access_token || token?.token;

    if (isMockAllowed && (!token || !bearerToken || bearerToken.startsWith('mock_') || bearerToken.includes('mock'))) {
      return SAMPLE_SLACK_MESSAGES.map((msg) => {
        const content = `Slack [${msg.channel}] @${msg.user} (${msg.ts}):\n${msg.text}`;
        const checksum = createHash('sha256').update(content).digest('hex');
        return {
          externalId: msg.id,
          checksum,
          date: msg.ts,
          subject: `${msg.channel}: Message from @${msg.user}`,
          snippet: msg.text.slice(0, 100),
        };
      });
    }

    if (!token) {
      throw new Error('Slack connector is not connected or token has been revoked');
    }

    if (!bearerToken) {
      throw new Error('Slack connector is missing valid access_token');
    }

    // 1. Fetch public channels
    const channelsRes = await fetch('https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=20', {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    const channelsData = await channelsRes.json();

    if (!channelsData.ok) {
      throw new Error(`Slack API error: ${channelsData.error || 'conversations.list failed'}`);
    }

    const oldestEpoch = Math.floor(cutoffDate.getTime() / 1000);
    const items: SyncItem[] = [];

    for (const ch of channelsData.channels || []) {
      if (items.length >= maxResults) break;
      const historyRes = await fetch(`https://slack.com/api/conversations.history?channel=${ch.id}&oldest=${oldestEpoch}&limit=20`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      const histData = await historyRes.json();

      if (histData.ok && histData.messages) {
        for (const msg of histData.messages) {
          const id = `${ch.id}_${msg.ts}`;
          const date = new Date(parseFloat(msg.ts) * 1000).toISOString();
          const text = msg.text || '';
          const checksum = createHash('sha256').update(`${id}:${text}:${date}`).digest('hex');

          items.push({
            externalId: id,
            checksum,
            date,
            subject: `#${ch.name || 'channel'}: ${text.slice(0, 40)}`,
            snippet: text.slice(0, 100),
          });
        }
      }
    }

    return items;
  }

  async fetch(workspaceId: string, externalId: string): Promise<FetchedDocument> {
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';

    if (externalId.startsWith('slack-msg-') && isMockAllowed) {
      const msg = SAMPLE_SLACK_MESSAGES.find((s) => s.id === externalId);
      if (msg) {
        const content = `Slack Channel: ${msg.channel}\nUser: @${msg.user}\nDate: ${msg.ts}\n\nMessage:\n${msg.text}`;
        const checksum = createHash('sha256').update(content).digest('hex');
        return {
          externalId: msg.id,
          content,
          checksum,
          date: msg.ts,
          meta: { channel: msg.channel, user: msg.user, text: msg.text },
        };
      }
    }

    const token = await getDecryptedToken<{
      access_token?: string;
      token?: string;
      authed_user?: { access_token?: string; id?: string };
    }>(workspaceId, 'slack');
    if (!token) {
      throw new Error('Slack connector is not connected or token has been revoked');
    }

    const bearerToken = token.authed_user?.access_token || token.access_token || token.token;
    if (!bearerToken) {
      throw new Error('Slack connector is missing valid access_token');
    }

    const parts = externalId.split('_');
    const channelId = parts[0];
    const ts = parts[1];

    let channelName = channelId;
    let messageText = '';
    let author = 'unknown';
    let messageDate = new Date().toISOString();
    let threadReplies: string[] = [];

    try {
      // 1. Fetch channel metadata
      const infoRes = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      const infoData = await infoRes.json();
      if (infoData.ok && infoData.channel?.name) {
        channelName = `#${infoData.channel.name}`;
      }

      // 2. Fetch message and replies
      const repliesRes = await fetch(`https://slack.com/api/conversations.replies?channel=${channelId}&ts=${ts}&limit=25`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      const repliesData = await repliesRes.json();
      if (repliesData.ok && repliesData.messages && repliesData.messages.length > 0) {
        const root = repliesData.messages[0];
        messageText = root.text || '';
        author = root.user || 'slack-user';
        if (root.ts) {
          messageDate = new Date(parseFloat(root.ts) * 1000).toISOString();
        }

        if (repliesData.messages.length > 1) {
          threadReplies = repliesData.messages.slice(1).map((r: any) => {
            const rDate = r.ts ? new Date(parseFloat(r.ts) * 1000).toISOString() : '';
            return `> @${r.user || 'user'} (${rDate}):\n> ${r.text || ''}`;
          });
        }
      }
    } catch (apiErr: any) {
      console.warn(`[Slack fetch error for ${externalId}]:`, apiErr?.message);
    }

    const threadSection = threadReplies.length > 0 ? `\n\n### Thread Replies (${threadReplies.length}):\n` + threadReplies.join('\n\n') : '';
    const content = `Slack Channel: ${channelName}\nAuthor: @${author}\nTimestamp: ${messageDate}\n\nMessage:\n${messageText || 'Message content unavailable'}${threadSection}`;
    const checksum = createHash('sha256').update(`${externalId}:${content}`).digest('hex');

    return {
      externalId,
      content,
      checksum,
      date: messageDate,
      meta: { channel: channelName, user: author, channelId, ts },
    };
  }

  async sync(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const { workspaceId, windowDays = DEFAULT_SLACK_WINDOW_DAYS } = options;

    try {
      const items = await this.list_changes(options);
      let syncedCount = 0;
      let unchangedCount = 0;
      const syncWindowStart = new Date(Date.now() - windowDays * 86400000).toISOString();

      for (const item of items) {
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM sources 
           WHERE workspace_id = $1 AND connector = 'slack' AND checksum = $2`,
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
            ) VALUES ($1, 'slack', $2, $3, 'untrusted_content', $4, NOW(), $5::jsonb)
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
            sourceName: doc.meta.channel || doc.externalId,
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
          `slack_sync: window=${windowDays}d synced=${syncedCount} unchanged=${unchangedCount}`,
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
      const errorMessage = err.message || 'Slack sync failed';

      await query(
        `UPDATE sources SET last_error = $2 WHERE workspace_id = $1 AND connector = 'slack'`,
        [workspaceId, errorMessage]
      );

      await query(
        `INSERT INTO access_logs (
          workspace_id, source_id, brief_id, action
        ) VALUES ($1, null, null, $2)`,
        [workspaceId, `slack_sync_error: ${errorMessage}`]
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
    await revokeToken(workspaceId, 'slack');
    await query(
      `INSERT INTO access_logs (
        workspace_id, source_id, brief_id, action
      ) VALUES ($1, null, null, 'slack_revoked')`,
      [workspaceId]
    );
  }
}

export const slackConnector = new SlackConnector();
