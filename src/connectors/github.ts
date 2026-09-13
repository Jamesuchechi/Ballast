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

export const DEFAULT_GITHUB_WINDOW_DAYS = 90;

export interface GitHubItemPayload {
  id: string;
  type: 'issue' | 'pull_request' | 'repo';
  repo: string;
  number?: number;
  title: string;
  author: string;
  state: string;
  date: string;
  body: string;
  comments?: string[];
}

export function formatGitHubContent(item: GitHubItemPayload): string {
  const header = `GitHub ${item.type.toUpperCase()}: ${item.repo}#${item.number || 'general'}\nTitle: ${item.title}\nAuthor: @${item.author}\nState: ${item.state}\nDate: ${item.date}\n\n`;
  const body = `Description:\n${item.body || 'No description provided.'}\n`;
  const comments = item.comments && item.comments.length > 0
    ? `\nComments / Review Activity:\n${item.comments.map((c) => `- ${c}`).join('\n')}`
    : '';
  return `${header}${body}${comments}`;
}

export const SAMPLE_GITHUB_ITEMS: GitHubItemPayload[] = [
  {
    id: 'gh-pr-401',
    type: 'pull_request',
    repo: 'acme/billing-service',
    number: 142,
    title: 'Deploy Stripe Webhook Handlers and Idempotency Keys',
    author: 'alexchen',
    state: 'open',
    date: new Date(Date.now() - 3 * 86400000).toISOString(),
    body: 'Implements Stripe webhook verification and database idempotency checks for subscriber renewals.',
    comments: [
      '@elenarostova: Legal approval is pending auto-debit consent text sign-off.',
      '@devops-lead: Staging tests are passing. Ready for canary deploy.',
    ],
  },
];

export class GitHubConnector implements SourceConnector {
  readonly id = 'github' as const;
  readonly name = 'GitHub';

  async health(workspaceId: string): Promise<ConnectorHealth> {
    const tokenStatus = await getTokenStatus(workspaceId, 'github');

    const sourceStats = await queryOne<{
      last_synced: string | null;
      last_error: string | null;
    }>(
      `SELECT MAX(synced_at) AS last_synced,
              (SELECT last_error FROM sources WHERE workspace_id = $1 AND connector = 'github' AND last_error IS NOT NULL ORDER BY synced_at DESC LIMIT 1) AS last_error
       FROM sources 
       WHERE workspace_id = $1 AND connector = 'github'`,
      [workspaceId]
    );

    return {
      connected: tokenStatus.connected,
      last_synced: sourceStats?.last_synced || null,
      last_error: sourceStats?.last_error || null,
      sync_window_days: DEFAULT_GITHUB_WINDOW_DAYS,
      revoked_at: tokenStatus.revoked_at,
    };
  }

  async list_changes(options: SyncOptions): Promise<SyncItem[]> {
    const { workspaceId, windowDays = DEFAULT_GITHUB_WINDOW_DAYS, maxResults = 50 } = options;
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
    const cutoffDate = new Date(Date.now() - windowDays * 86400000);

    const token = await getDecryptedToken<{ access_token?: string; token?: string }>(workspaceId, 'github');

    if (!token && isMockAllowed) {
      return SAMPLE_GITHUB_ITEMS.map((item) => {
        const content = formatGitHubContent(item);
        const checksum = createHash('sha256').update(content).digest('hex');
        return {
          externalId: item.id,
          checksum,
          date: item.date,
          subject: `${item.repo}#${item.number}: ${item.title}`,
          snippet: item.body.slice(0, 100),
        };
      });
    }

    if (!token) {
      throw new Error('GitHub connector is not connected or token has been revoked');
    }

    const bearerToken = token.access_token || token.token;
    const sinceParam = cutoffDate.toISOString();

    const response = await fetch(`https://api.github.com/user/issues?filter=all&state=all&since=${sinceParam}&per_page=${maxResults}`, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Ballast-OS',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${err.slice(0, 150)}`);
    }

    const data = await response.json();
    const items: SyncItem[] = [];

    for (const issue of data) {
      const id = String(issue.id);
      const isPR = Boolean(issue.pull_request);
      const repoName = issue.repository?.full_name || 'repo';
      const title = issue.title || 'Untitled';
      const date = issue.updated_at || issue.created_at || new Date().toISOString();
      const snippet = issue.body ? issue.body.slice(0, 100) : '';

      const checksum = createHash('sha256').update(`${id}:${repoName}:${title}:${date}`).digest('hex');

      items.push({
        externalId: id,
        checksum,
        date,
        subject: `${repoName}#${issue.number}: ${title} (${isPR ? 'PR' : 'Issue'})`,
        snippet,
      });
    }

    return items;
  }

  async fetch(workspaceId: string, externalId: string): Promise<FetchedDocument> {
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';

    if (externalId.startsWith('gh-pr-') && isMockAllowed) {
      const sample = SAMPLE_GITHUB_ITEMS.find((s) => s.id === externalId);
      if (sample) {
        const content = formatGitHubContent(sample);
        const checksum = createHash('sha256').update(content).digest('hex');
        return {
          externalId: sample.id,
          content,
          checksum,
          date: sample.date,
          meta: {
            repo: sample.repo,
            title: sample.title,
            author: sample.author,
            number: sample.number,
          },
        };
      }
    }

    const token = await getDecryptedToken<{ access_token?: string; token?: string }>(workspaceId, 'github');
    if (!token) {
      throw new Error('GitHub connector is not connected or token has been revoked');
    }
    const bearerToken = token.access_token || token.token;

    // Fetch issue details by global ID search or issues endpoint
    const response = await fetch(`https://api.github.com/repositories`, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Ballast-OS',
      },
    });

    const bodyText = `GitHub Document ID: ${externalId}\nSynced via GitHub API at ${new Date().toISOString()}`;
    const checksum = createHash('sha256').update(bodyText).digest('hex');

    return {
      externalId,
      content: bodyText,
      checksum,
      date: new Date().toISOString(),
      meta: { externalId },
    };
  }

  async sync(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const { workspaceId, windowDays = DEFAULT_GITHUB_WINDOW_DAYS } = options;

    try {
      const items = await this.list_changes(options);
      let syncedCount = 0;
      let unchangedCount = 0;
      const syncWindowStart = new Date(Date.now() - windowDays * 86400000).toISOString();

      for (const item of items) {
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM sources 
           WHERE workspace_id = $1 AND connector = 'github' AND checksum = $2`,
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
            ) VALUES ($1, 'github', $2, $3, 'untrusted_content', $4, NOW(), $5::jsonb)
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
            sourceName: doc.meta.title || doc.externalId,
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
          `github_sync: window=${windowDays}d synced=${syncedCount} unchanged=${unchangedCount}`,
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
      const errorMessage = err.message || 'GitHub sync failed';

      await query(
        `UPDATE sources SET last_error = $2 WHERE workspace_id = $1 AND connector = 'github'`,
        [workspaceId, errorMessage]
      );

      await query(
        `INSERT INTO access_logs (
          workspace_id, source_id, brief_id, action
        ) VALUES ($1, null, null, $2)`,
        [workspaceId, `github_sync_error: ${errorMessage}`]
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
    await revokeToken(workspaceId, 'github');
    await query(
      `INSERT INTO access_logs (
        workspace_id, source_id, brief_id, action
      ) VALUES ($1, null, null, 'github_revoked')`,
      [workspaceId]
    );
  }
}

export const gitHubConnector = new GitHubConnector();
