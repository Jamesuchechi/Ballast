import crypto from 'crypto';
import { query, queryOne } from '@/db/client';
import { chunkAndEmbedText } from './embeddings';
import { formatGitHubContent, type GitHubItemPayload } from '@/connectors/github';
import type { ConnectorType } from './types';

export interface WebhookIngestResult {
  success: boolean;
  sourceId: string;
  action: 'created' | 'updated' | 'unchanged';
  connector: ConnectorType;
  externalId: string;
}

/**
 * Validates HMAC SHA-256 signature for GitHub Webhooks (X-Hub-Signature-256).
 */
export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const expectedSig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'utf8'),
      Buffer.from(expectedSig, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Validates Slack Webhook signature (X-Slack-Signature).
 * Protects against replay attacks using 5-minute timestamp window.
 */
export function verifySlackSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !timestampHeader || !secret) return false;

  // Replay attack check: verify timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestampHeader, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) {
    return false;
  }

  const sigBaseString = `v0:${timestampHeader}:${rawBody}`;
  const expectedSig = 'v0=' + crypto.createHmac('sha256', secret).update(sigBaseString).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'utf8'),
      Buffer.from(expectedSig, 'utf8')
    );
  } catch {
    return false;
  }
}

/**
 * Idempotently ingests and indexes real-time documents into Ballast vector database.
 */
export async function ingestWebhookDocument(params: {
  workspaceId: string;
  connector: ConnectorType;
  externalId: string;
  content: string;
  meta: Record<string, any>;
  title?: string;
}): Promise<WebhookIngestResult> {
  const { workspaceId, connector, externalId, content, meta, title } = params;

  const checksum = crypto.createHash('sha256').update(content).digest('hex');

  // Check for deduplication / existing source (FR2.10)
  const existing = await queryOne<{ id: string; checksum: string }>(
    `SELECT id, checksum FROM sources 
     WHERE workspace_id = $1 AND connector = $2 AND external_id = $3`,
    [workspaceId, connector, externalId]
  );

  let sourceId: string;
  let action: 'created' | 'updated' | 'unchanged';

  if (existing) {
    sourceId = existing.id;
    if (existing.checksum === checksum) {
      await query(
        `UPDATE sources 
         SET synced_at = NOW(), last_error = null 
         WHERE id = $1`,
        [existing.id]
      );
      action = 'unchanged';
    } else {
      // Content modified: update source metadata and re-embed chunk vectors
      await query(
        `UPDATE sources 
         SET checksum = $2, meta = $3::jsonb, synced_at = NOW(), last_error = null 
         WHERE id = $1`,
        [existing.id, checksum, JSON.stringify(meta)]
      );
      await query(`DELETE FROM chunks WHERE source_id = $1`, [existing.id]);
      await chunkAndEmbedText({
        workspaceId,
        sourceId: existing.id,
        text: content,
        sourceName: title || externalId,
      });
      action = 'updated';
    }
  } else {
    // Insert brand new source
    const insertRes = await query<{ id: string }>(
      `INSERT INTO sources (
        workspace_id, connector, external_id, checksum, trust_boundary,
        sync_window_start, synced_at, meta
      ) VALUES ($1, $2, $3, $4, 'untrusted_content', NOW() - INTERVAL '30 days', NOW(), $5::jsonb)
      RETURNING id`,
      [workspaceId, connector, externalId, checksum, JSON.stringify(meta)]
    );
    sourceId = insertRes[0].id;

    await chunkAndEmbedText({
      workspaceId,
      sourceId,
      text: content,
      sourceName: title || externalId,
    });
    action = 'created';
  }

  // Record audit trail in access_logs
  await query(
    `INSERT INTO access_logs (workspace_id, source_id, brief_id, action)
     VALUES ($1, $2, null, $3)`,
    [
      workspaceId,
      sourceId,
      `webhook_sync:${connector}:${externalId} action=${action}`,
    ]
  );

  return {
    success: true,
    sourceId,
    action,
    connector,
    externalId,
  };
}

/**
 * Processes incoming GitHub Webhook Events (issues, pull_request, issue_comment, push).
 */
export async function processGitHubWebhook(params: {
  workspaceId: string;
  event: string;
  payload: any;
}): Promise<WebhookIngestResult | null> {
  const { workspaceId, event, payload } = params;

  if (event === 'ping') {
    return null;
  }

  if (event === 'issues' && payload.issue) {
    const issue = payload.issue;
    const repo = payload.repository?.full_name || 'github/repo';
    const item: GitHubItemPayload = {
      id: `gh-issue-${issue.id}`,
      type: 'issue',
      repo,
      number: issue.number,
      title: issue.title || 'Untitled Issue',
      author: issue.user?.login || 'unknown',
      state: issue.state || 'open',
      date: issue.updated_at || issue.created_at || new Date().toISOString(),
      body: issue.body || '',
      comments: [],
    };

    const content = formatGitHubContent(item);
    return ingestWebhookDocument({
      workspaceId,
      connector: 'github',
      externalId: `${repo}#${issue.number}`,
      content,
      meta: {
        repo,
        number: issue.number,
        title: item.title,
        author: item.author,
        state: item.state,
        type: 'issue',
        url: issue.html_url,
      },
      title: `[Issue] ${item.title} (${repo}#${issue.number})`,
    });
  }

  if (event === 'pull_request' && payload.pull_request) {
    const pr = payload.pull_request;
    const repo = payload.repository?.full_name || 'github/repo';
    const item: GitHubItemPayload = {
      id: `gh-pr-${pr.id}`,
      type: 'pull_request',
      repo,
      number: pr.number,
      title: pr.title || 'Untitled Pull Request',
      author: pr.user?.login || 'unknown',
      state: pr.state || 'open',
      date: pr.updated_at || pr.created_at || new Date().toISOString(),
      body: pr.body || '',
      comments: [],
    };

    const content = formatGitHubContent(item);
    return ingestWebhookDocument({
      workspaceId,
      connector: 'github',
      externalId: `${repo}#${pr.number}`,
      content,
      meta: {
        repo,
        number: pr.number,
        title: item.title,
        author: item.author,
        state: item.state,
        type: 'pull_request',
        url: pr.html_url,
      },
      title: `[PR] ${item.title} (${repo}#${pr.number})`,
    });
  }

  if (event === 'issue_comment' && payload.issue && payload.comment) {
    const issue = payload.issue;
    const repo = payload.repository?.full_name || 'github/repo';
    const comment = payload.comment;
    const externalId = `${repo}#${issue.number}`;

    const content = `GitHub Activity on ${repo}#${issue.number}: "${issue.title}"\nComment by @${comment.user?.login || 'user'} at ${comment.created_at}:\n${comment.body || ''}`;
    
    return ingestWebhookDocument({
      workspaceId,
      connector: 'github',
      externalId: `${externalId}-comment-${comment.id}`,
      content,
      meta: {
        repo,
        number: issue.number,
        commentId: comment.id,
        author: comment.user?.login,
        url: comment.html_url,
      },
      title: `[Comment] @${comment.user?.login} on ${repo}#${issue.number}`,
    });
  }

  return null;
}

/**
 * Processes incoming Slack Webhook / Events API payloads (messages, mentions).
 */
export async function processSlackWebhook(params: {
  workspaceId: string;
  payload: any;
}): Promise<WebhookIngestResult | null> {
  const { workspaceId, payload } = params;

  if (payload.type === 'event_callback' && payload.event) {
    const ev = payload.event;
    if (ev.type === 'message' && !ev.subtype && ev.text) {
      const channel = ev.channel || 'general';
      const user = ev.user || 'user';
      const ts = ev.ts || `${Date.now() / 1000}`;
      const externalId = `slack-${channel}-${ts}`;

      const content = `Slack Message in #${channel} from @${user} at ${new Date(parseFloat(ts) * 1000).toISOString()}:\n${ev.text}`;

      return ingestWebhookDocument({
        workspaceId,
        connector: 'slack',
        externalId,
        content,
        meta: {
          channel,
          user,
          ts,
          team: payload.team_id,
        },
        title: `Slack Message in #${channel}`,
      });
    }
  }

  return null;
}

/**
 * Processes generic custom webhook payloads.
 */
export async function processGenericWebhook(params: {
  workspaceId: string;
  connector?: ConnectorType;
  externalId: string;
  title: string;
  content: string;
  meta?: Record<string, any>;
}): Promise<WebhookIngestResult> {
  const {
    workspaceId,
    connector = 'web',
    externalId,
    title,
    content,
    meta = {},
  } = params;

  return ingestWebhookDocument({
    workspaceId,
    connector,
    externalId,
    content,
    meta,
    title,
  });
}
