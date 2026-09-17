import { createHash, randomUUID } from 'node:crypto';
import { query, queryOne } from '@/db/client';
import { chunkAndEmbedText } from '@/core/embeddings';
import type {
  SourceConnector,
  ConnectorHealth,
  SyncOptions,
  SyncItem,
  FetchedDocument,
  SyncResult,
} from './types';

export interface WebSearchPage {
  url: string;
  title: string;
  snippet: string;
  content: string;
  domain: string;
}

export interface WebSnapshotResult {
  sourceId: string;
  url: string;
  title: string;
  checksum: string;
  fetched_at: string;
  chunkCount: number;
}

/**
 * Built-in authoritative mock web knowledge corpus used for offline tests,
 * CI environments, and realistic multi-class generation.
 */
export const SAMPLE_WEB_CORPUS: WebSearchPage[] = [
  {
    url: 'https://stripe.com/docs/webhooks/signatures',
    title: 'Verifying Webhook Signatures — Stripe Documentation',
    domain: 'stripe.com',
    snippet: 'Use Stripe-Signature headers to prevent replay attacks and verify payload integrity.',
    content: `Stripe Webhook Signature Verification Guide:
To verify Stripe webhook signatures, extract the timestamp and signatures from the Stripe-Signature header.
Stripe recommends a tolerance of 300 seconds between timestamp and current server time.
Always use the raw request body bytes for HMAC computation.
Secret webhook keys should be rotated quarterly in production environments.`,
  },
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429',
    title: '429 Too Many Requests — MDN Web Docs',
    domain: 'developer.mozilla.org',
    snippet: 'The HTTP 429 Too Many Requests response status code indicates the user has sent too many requests.',
    content: `HTTP 429 Too Many Requests Specification:
A 429 response is not a fatal server error; it indicates rate limiting by the upstream provider.
Servers SHOULD include a Retry-After header indicating how long the client must wait before making another request.
Clients should implement exponential backoff with jitter when handling 429 responses.`,
  },
  {
    url: 'https://gdpr-info.eu/art-6-gdpr/',
    title: 'Article 6 GDPR — Lawfulness of Processing',
    domain: 'gdpr-info.eu',
    snippet: 'Processing shall be lawful only if and to the extent that at least one of the following applies: consent, contract necessity.',
    content: `General Data Protection Regulation Article 6:
Processing of personal data requires a lawful basis: explicit consent or performance of a contract.
For automated recurring debit arrangements, unambiguous opt-in consent must be stored with timestamp and IP address.
Pre-ticked consent boxes are explicitly invalid under EU Court of Justice rulings.`,
  },
];

export const DEFAULT_WEB_MAX_RESULTS = 10;

/**
 * Helper to query live web sources (direct URL fetch, Wikipedia API, DuckDuckGo API)
 * with graceful timeout and automatic text extraction.
 */
async function fetchLiveWebPages(
  searchQuery: string,
  maxResults: number = DEFAULT_WEB_MAX_RESULTS
): Promise<WebSearchPage[]> {
  const pages: WebSearchPage[] = [];

  // Check if searchQuery is a direct URL or contains a URL
  const urlMatch = searchQuery.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    const targetUrl = urlMatch[0];
    try {
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Ballast/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const html = await res.text();
        const text = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const domain = new URL(targetUrl).hostname;
        const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : `${domain} Web Document`;
        if (text.length > 50) {
          pages.push({
            url: targetUrl,
            title,
            domain,
            snippet: text.slice(0, 200),
            content: text.slice(0, 4000),
          });
          return pages;
        }
      }
    } catch (e) {
      console.warn('[WEB] Direct URL fetch fallback:', e);
    }
  }

  // Attempt live Wikipedia Search API
  try {
    const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      searchQuery
    )}&utf8=&format=json`;
    const wikiRes = await fetch(wikiSearchUrl, {
      headers: { 'User-Agent': 'Ballast/1.0 (https://ballast.local; contact@ballast.local)' },
      signal: AbortSignal.timeout(4000),
    });
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const hits = (wikiData.query?.search || []).slice(0, maxResults);
      for (const hit of hits) {
        const pageId = hit.pageid;
        const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&pageids=${pageId}&format=json`;
        const extRes = await fetch(extractUrl, {
          headers: { 'User-Agent': 'Ballast/1.0' },
          signal: AbortSignal.timeout(3000),
        });
        let extract = hit.snippet.replace(/<[^>]+>/g, '');
        if (extRes.ok) {
          const extData = await extRes.json();
          const pageObj = extData.query?.pages?.[pageId];
          if (pageObj?.extract) {
            extract = pageObj.extract;
          }
        }
        const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/\s+/g, '_'))}`;
        pages.push({
          url: articleUrl,
          title: `${hit.title} — Wikipedia`,
          domain: 'en.wikipedia.org',
          snippet: hit.snippet.replace(/<[^>]+>/g, ''),
          content: `${hit.title}:\n${extract}`,
        });
      }
    }
  } catch (e) {
    console.warn('[WEB] Wikipedia search fallback:', e);
  }

  // Attempt DuckDuckGo Instant Answer API
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json`;
    const ddgRes = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'Ballast/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      if (ddgData.AbstractText && ddgData.AbstractURL) {
        pages.push({
          url: ddgData.AbstractURL,
          title: `${ddgData.Heading || searchQuery} — DuckDuckGo Knowledge`,
          domain: new URL(ddgData.AbstractURL).hostname,
          snippet: ddgData.AbstractText.slice(0, 200),
          content: `${ddgData.Heading}:\n${ddgData.AbstractText}`,
        });
      }
      if (Array.isArray(ddgData.RelatedTopics)) {
        for (const topic of ddgData.RelatedTopics.slice(0, maxResults - pages.length)) {
          if (topic.Text && topic.FirstURL) {
            try {
              pages.push({
                url: topic.FirstURL,
                title: `${topic.Text.slice(0, 60)}...`,
                domain: new URL(topic.FirstURL).hostname,
                snippet: topic.Text,
                content: topic.Text,
              });
            } catch {}
          }
        }
      }
    }
  } catch (e) {
    console.warn('[WEB] DuckDuckGo search fallback:', e);
  }

  return pages.slice(0, maxResults);
}

export class WebConnector implements SourceConnector {
  readonly id = 'web' as const;
  readonly name = 'Web';

  async health(workspaceId: string): Promise<ConnectorHealth> {
    const stats = await queryOne<{
      last_synced: string | null;
      last_error: string | null;
    }>(
      `SELECT MAX(fetched_at) AS last_synced,
              (SELECT last_error FROM sources WHERE workspace_id = $1 AND connector = 'web' AND last_error IS NOT NULL ORDER BY fetched_at DESC LIMIT 1) AS last_error
       FROM sources 
       WHERE workspace_id = $1 AND connector = 'web'`,
      [workspaceId]
    );

    return {
      connected: true,
      last_synced: stats?.last_synced || null,
      last_error: stats?.last_error || null,
      sync_window_days: 0,
      revoked_at: null,
    };
  }

  async healthCheck(workspaceId: string = 'default'): Promise<ConnectorHealth> {
    return this.health(workspaceId);
  }

  async list_changes(options: SyncOptions): Promise<SyncItem[]> {
    return [];
  }

  async fetch(workspaceId: string, externalId: string): Promise<FetchedDocument> {
    const source = await queryOne<{
      external_id: string;
      checksum: string;
      raw_uri: string;
      meta: any;
    }>(
      `SELECT external_id, checksum, raw_uri, meta FROM sources WHERE workspace_id = $1 AND connector = 'web' AND external_id = $2 LIMIT 1`,
      [workspaceId, externalId]
    );

    if (!source) {
      throw new Error(`Web source snapshot ${externalId} not found`);
    }

    return {
      externalId: source.external_id,
      content: source.raw_uri,
      checksum: source.checksum,
      date: new Date().toISOString(),
      meta: source.meta || {},
    };
  }

  async sync(options: SyncOptions): Promise<SyncResult> {
    return {
      syncedCount: 0,
      unchangedCount: 0,
      windowDays: 0,
      durationMs: 0,
      error: null,
    };
  }

  async revoke(workspaceId: string): Promise<void> {
    // Web connector has no persistent OAuth token to revoke
  }

  /**
   * Searches the web, downloads the content, and stores an immutable snapshot in `sources` (FR2.7).
   * Citations to the live internet without a stored snapshot are a defect.
   */
  async searchAndSnapshot(options: {
    workspaceId: string;
    query: string;
    maxResults?: number;
  }): Promise<WebSnapshotResult[]> {
    const { workspaceId, query: searchQuery, maxResults = DEFAULT_WEB_MAX_RESULTS } = options;
    const normalizedQuery = searchQuery.toLowerCase();

    // 1. First check live web results (Wikipedia, DuckDuckGo, direct URL)
    let matchedPages: WebSearchPage[] = [];
    try {
      matchedPages = await fetchLiveWebPages(searchQuery, maxResults);
    } catch (e) {
      console.warn('[WEB] Live web fetch error, falling back to corpus:', e);
    }

    // 2. If live search returned fewer than maxResults, supplement from sample corpus ONLY in dev/eval/test
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
    if (matchedPages.length < maxResults && isMockAllowed) {
      const corpusMatches = SAMPLE_WEB_CORPUS.filter((page) => {
        const words = normalizedQuery.split(/\W+/).filter((w) => w.length > 3);
        if (words.length === 0) return true;
        return words.some(
          (w) =>
            page.title.toLowerCase().includes(w) ||
            page.content.toLowerCase().includes(w) ||
            page.snippet.toLowerCase().includes(w)
        );
      }).slice(0, maxResults - matchedPages.length);

      matchedPages = [...matchedPages, ...corpusMatches];
    }

    const results: WebSnapshotResult[] = [];

    for (const page of matchedPages) {
      const checksum = createHash('sha256').update(page.content).digest('hex');
      const fetchedAt = new Date().toISOString();

      // Check if this source already exists in the workspace (Task D3)
      const existing = await queryOne<{ id: string; checksum: string }>(
        `SELECT id, checksum FROM sources WHERE workspace_id = $1 AND connector = 'web' AND external_id = $2`,
        [workspaceId, page.url]
      );

      let sourceId: string;

      if (existing) {
        sourceId = existing.id;
        if (existing.checksum === checksum) {
          await query(
            `UPDATE sources SET fetched_at = $2 WHERE id = $1`,
            [sourceId, fetchedAt]
          );
        } else {
          // Content updated: update source and replace chunks
          await query(
            `UPDATE sources SET checksum = $2, fetched_at = $3, meta = $4::jsonb WHERE id = $1`,
            [
              sourceId,
              checksum,
              fetchedAt,
              JSON.stringify({
                title: page.title,
                domain: page.domain,
                query: searchQuery,
              }),
            ]
          );
          await query(`DELETE FROM chunks WHERE source_id = $1`, [sourceId]);
          await chunkAndEmbedText({
            workspaceId,
            sourceId,
            text: `${page.title}\nSource: ${page.url}\n\n${page.content}`,
            sourceName: page.title,
          });
        }
      } else {
        // Persist snapshot to sources table (FR2.7)
        const insertRes = await query<{ id: string }>(
          `INSERT INTO sources (
            workspace_id, connector, external_id, checksum, trust_boundary,
            fetched_at, raw_uri, meta
          ) VALUES ($1, 'web', $2, $3, 'untrusted_content', $4, $5, $6::jsonb)
          RETURNING id`,
          [
            workspaceId,
            page.url,
            checksum,
            fetchedAt,
            page.url,
            JSON.stringify({
              title: page.title,
              domain: page.domain,
              query: searchQuery,
            }),
          ]
        );
        sourceId = insertRes[0].id;

        // Chunk and embed page into pgvector
        await chunkAndEmbedText({
          workspaceId,
          sourceId,
          text: `${page.title}\nSource: ${page.url}\n\n${page.content}`,
          sourceName: page.title,
        });
      }

      // Record access log entry for auditing web fetch and snapshot ingestion (NFR2.4, NFR6.4)
      try {
        await query(
          `INSERT INTO access_logs (workspace_id, source_id, action) VALUES ($1, $2, $3)`,
          [workspaceId, sourceId, `web_snapshot: url=${page.url}`]
        );
      } catch (e) {
        console.warn('[WEB] Access log record failed:', e);
      }

      const chunkCountRow = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM chunks WHERE source_id = $1`,
        [sourceId]
      );

      results.push({
        sourceId,
        url: page.url,
        title: page.title,
        checksum,
        fetched_at: fetchedAt,
        chunkCount: parseInt(chunkCountRow?.count || '1', 10),
      });
    }

    return results;
  }
}

export const webConnector = new WebConnector();
