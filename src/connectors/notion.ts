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

export const DEFAULT_NOTION_WINDOW_DAYS = 90;

export interface NotionPagePayload {
  id: string;
  title: string;
  lastEditedTime: string;
  content: string;
}

export const SAMPLE_NOTION_PAGES: NotionPagePayload[] = [
  {
    id: 'notion-page-601',
    title: 'Q3 Product & Merchant Infrastructure Spec',
    lastEditedTime: new Date(Date.now() - 5 * 86400000).toISOString(),
    content: `# Q3 Product Infrastructure
Owner: Alex Chen
Status: In Progress

## Key Milestones:
1. Migration of merchant dashboards to Stripe Connect.
2. Compliance verification with Elena Rostova from legal team.
3. Dry run of database migrations on PostgreSQL read replica.`,
  },
];

export class NotionConnector implements SourceConnector {
  readonly id = 'notion' as const;
  readonly name = 'Notion';

  async health(workspaceId: string): Promise<ConnectorHealth> {
    const tokenStatus = await getTokenStatus(workspaceId, 'notion');

    const sourceStats = await queryOne<{
      last_synced: string | null;
      last_error: string | null;
    }>(
      `SELECT MAX(synced_at) AS last_synced,
              (SELECT last_error FROM sources WHERE workspace_id = $1 AND connector = 'notion' AND last_error IS NOT NULL ORDER BY synced_at DESC LIMIT 1) AS last_error
       FROM sources 
       WHERE workspace_id = $1 AND connector = 'notion'`,
      [workspaceId]
    );

    return {
      connected: tokenStatus.connected,
      last_synced: sourceStats?.last_synced || null,
      last_error: sourceStats?.last_error || null,
      sync_window_days: DEFAULT_NOTION_WINDOW_DAYS,
      revoked_at: tokenStatus.revoked_at,
    };
  }

  async list_changes(options: SyncOptions): Promise<SyncItem[]> {
    const { workspaceId, windowDays = DEFAULT_NOTION_WINDOW_DAYS, maxResults = 50 } = options;
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
    const cutoffDate = new Date(Date.now() - windowDays * 86400000);

    const token = await getDecryptedToken<{ access_token?: string; token?: string }>(workspaceId, 'notion');
    const bearerToken = token?.access_token || token?.token;

    if (isMockAllowed && (!token || !bearerToken || bearerToken.startsWith('mock_') || bearerToken.includes('mock'))) {
      return SAMPLE_NOTION_PAGES.map((page) => {
        const checksum = createHash('sha256').update(page.content).digest('hex');
        return {
          externalId: page.id,
          checksum,
          date: page.lastEditedTime,
          subject: page.title,
          snippet: page.content.slice(0, 100),
        };
      });
    }

    if (!token) {
      throw new Error('Notion connector is not connected or token has been revoked');
    }

    if (!bearerToken) {
      throw new Error('Notion connector is missing valid access_token');
    }

    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: maxResults,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion API search error (${res.status}): ${err.slice(0, 150)}`);
    }

    const data = await res.json();
    const items: SyncItem[] = [];

    for (const result of data.results || []) {
      const lastEdited = result.last_edited_time || new Date().toISOString();
      if (new Date(lastEdited) < cutoffDate) continue;

      let title = 'Untitled Page';
      if (result.properties?.title?.title?.[0]?.plain_text) {
        title = result.properties.title.title[0].plain_text;
      } else if (result.properties?.Name?.title?.[0]?.plain_text) {
        title = result.properties.Name.title[0].plain_text;
      }

      const id = result.id;
      const checksum = createHash('sha256').update(`${id}:${title}:${lastEdited}`).digest('hex');

      items.push({
        externalId: id,
        checksum,
        date: lastEdited,
        subject: title,
        snippet: `Notion ${result.object}: ${title}`,
      });
    }

    return items;
  }

  async fetch(workspaceId: string, externalId: string): Promise<FetchedDocument> {
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';

    if (externalId.startsWith('notion-page-') && isMockAllowed) {
      const page = SAMPLE_NOTION_PAGES.find((p) => p.id === externalId);
      if (page) {
        const checksum = createHash('sha256').update(page.content).digest('hex');
        return {
          externalId: page.id,
          content: page.content,
          checksum,
          date: page.lastEditedTime,
          meta: { title: page.title },
        };
      }
    }

    const token = await getDecryptedToken<{ access_token?: string; token?: string }>(workspaceId, 'notion');
    if (!token) {
      throw new Error('Notion connector is not connected or token has been revoked');
    }

    const bearerToken = token.access_token || token.token;
    if (!bearerToken) {
      throw new Error('Notion connector is missing valid access_token');
    }

    let pageTitle = 'Untitled Notion Document';
    let lastEditedTime = new Date().toISOString();
    let pageUrl = '';

    // 1. Fetch Page Metadata (Title, URL, Timestamps)
    try {
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${externalId}`, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Notion-Version': '2022-06-28',
        },
      });
      if (pageRes.ok) {
        const pageData = await pageRes.json();
        if (pageData.url) pageUrl = pageData.url;
        if (pageData.last_edited_time) lastEditedTime = pageData.last_edited_time;

        const titleProp =
          pageData.properties?.title?.title ||
          pageData.properties?.Name?.title ||
          pageData.properties?.Page?.title;
        if (Array.isArray(titleProp) && titleProp.length > 0) {
          pageTitle = titleProp.map((t: any) => t.plain_text).join('');
        }
      }
    } catch (pageErr: any) {
      console.warn(`[Notion page info error for ${externalId}]:`, pageErr?.message);
    }

    // 2. Fetch page block children (up to 200 blocks with pagination)
    const textBlocks: string[] = [];
    try {
      let cursor: string | undefined = undefined;
      let fetched = 0;

      while (fetched < 200) {
        const url: string = cursor
          ? `https://api.notion.com/v1/blocks/${externalId}/children?page_size=100&start_cursor=${cursor}`
          : `https://api.notion.com/v1/blocks/${externalId}/children?page_size=100`;

        const blocksRes = await fetch(url, {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Notion-Version': '2022-06-28',
          },
        });

        if (!blocksRes.ok) break;
        const blocksData = await blocksRes.json();
        const results = blocksData.results || [];

        for (const block of results) {
          const formatted = renderNotionBlock(block);
          if (formatted) textBlocks.push(formatted);
        }

        fetched += results.length;
        if (!blocksData.has_more || !blocksData.next_cursor) break;
        cursor = blocksData.next_cursor;
      }
    } catch (blockErr: any) {
      console.warn(`[Notion blocks fetch error for ${externalId}]:`, blockErr?.message);
    }

    const content = `# ${pageTitle}\nSource: Notion Page (${externalId})\nLast Edited: ${lastEditedTime}${pageUrl ? `\nURL: ${pageUrl}` : ''}\n\n${textBlocks.join('\n\n') || 'No textual content found in page.'}`;
    const checksum = createHash('sha256').update(`${externalId}:${content}`).digest('hex');

    return {
      externalId,
      content,
      checksum,
      date: lastEditedTime,
      meta: { title: pageTitle, externalId, url: pageUrl },
    };
  }

  async sync(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const { workspaceId, windowDays = DEFAULT_NOTION_WINDOW_DAYS } = options;

    try {
      const items = await this.list_changes(options);
      let syncedCount = 0;
      let unchangedCount = 0;
      const syncWindowStart = new Date(Date.now() - windowDays * 86400000).toISOString();

      for (const item of items) {
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM sources 
           WHERE workspace_id = $1 AND connector = 'notion' AND checksum = $2`,
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
            ) VALUES ($1, 'notion', $2, $3, 'untrusted_content', $4, NOW(), $5::jsonb)
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
          `notion_sync: window=${windowDays}d synced=${syncedCount} unchanged=${unchangedCount}`,
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
      const errorMessage = err.message || 'Notion sync failed';

      await query(
        `UPDATE sources SET last_error = $2 WHERE workspace_id = $1 AND connector = 'notion'`,
        [workspaceId, errorMessage]
      );

      await query(
        `INSERT INTO access_logs (
          workspace_id, source_id, brief_id, action
        ) VALUES ($1, null, null, $2)`,
        [workspaceId, `notion_sync_error: ${errorMessage}`]
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
    await revokeToken(workspaceId, 'notion');
    await query(
      `INSERT INTO access_logs (
        workspace_id, source_id, brief_id, action
      ) VALUES ($1, null, null, 'notion_revoked')`,
      [workspaceId]
    );
  }
}

export const notionConnector = new NotionConnector();

/**
 * Converts Notion block objects into Markdown syntax.
 */
export function renderNotionBlock(block: any): string {
  if (!block || !block.type) return '';
  const type = block.type;
  const data = block[type];
  if (!data) return '';

  const richText: any[] = data.rich_text || [];
  const text = richText.map((t: any) => t.plain_text || '').join('');

  switch (type) {
    case 'paragraph':
      return text;
    case 'heading_1':
      return `# ${text}`;
    case 'heading_2':
      return `## ${text}`;
    case 'heading_3':
      return `### ${text}`;
    case 'bulleted_list_item':
      return `- ${text}`;
    case 'numbered_list_item':
      return `1. ${text}`;
    case 'to_do':
      return `${data.checked ? '[x]' : '[ ]'} ${text}`;
    case 'toggle':
      return `> ${text}`;
    case 'quote':
      return `> ${text}`;
    case 'callout':
      return `> 💡 ${text}`;
    case 'code':
      return `\`\`\`${data.language || ''}\n${text}\n\`\`\``;
    case 'divider':
      return '---';
    default:
      return text ? text : '';
  }
}
