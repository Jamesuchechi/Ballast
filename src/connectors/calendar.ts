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

export const DEFAULT_CALENDAR_WINDOW_DAYS = 30;

export interface CalendarEventPayload {
  id: string;
  summary: string;
  organizer?: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  attendees?: string[];
}

export function formatCalendarContent(e: CalendarEventPayload): string {
  const lines = [
    `Event: ${e.summary}`,
    `Start: ${e.start}`,
    `End: ${e.end}`,
  ];
  if (e.organizer) lines.push(`Organizer: ${e.organizer}`);
  if (e.location) lines.push(`Location: ${e.location}`);
  if (e.attendees && e.attendees.length > 0) lines.push(`Attendees: ${e.attendees.join(', ')}`);
  if (e.description) lines.push(`\nDescription:\n${e.description}`);
  return lines.join('\n');
}

/**
 * Representative sample calendar events used strictly in mock/eval mode.
 */
export const SAMPLE_CALENDAR_EVENTS: CalendarEventPayload[] = [
  {
    id: 'cal-event-201',
    summary: 'Q3 Billing & Stripe Deployment Review',
    organizer: 'alex.chen@acme.corp',
    start: new Date(Date.now() + 86400000).toISOString(),
    end: new Date(Date.now() + 90000000).toISOString(),
    location: 'Conference Room 3B / Google Meet',
    description: 'Final walkthrough of merchant accounts configuration and staging test results.',
    attendees: ['alex.chen@acme.corp', 'elena.rostova@legal.corp'],
  },
  {
    id: 'cal-event-202',
    summary: 'Legal Compliance Sign-off Window',
    organizer: 'elena.rostova@legal.corp',
    start: new Date(Date.now() + 2 * 86400000).toISOString(),
    end: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(),
    location: 'Virtual',
    description: 'Review consumer terms of service and consent wording for auto-debit.',
    attendees: ['elena.rostova@legal.corp'],
  },
];

export async function getCalendarToken(
  workspaceId: string
): Promise<{ token: Record<string, any>; tokenConnector: string } | null> {
  const calToken = await getDecryptedToken<Record<string, any>>(workspaceId, 'calendar');
  if (calToken && calToken.access_token) {
    return { token: calToken, tokenConnector: 'calendar' };
  }

  // Fallback to gmail token ONLY if it has calendar scopes
  const gmailStatus = await getTokenStatus(workspaceId, 'gmail');
  if (gmailStatus.connected && gmailStatus.scopes?.some((s) => s.includes('calendar'))) {
    const gmailToken = await getDecryptedToken<Record<string, any>>(workspaceId, 'gmail');
    if (gmailToken && gmailToken.access_token) {
      return { token: gmailToken, tokenConnector: 'gmail' };
    }
  }

  return null;
}

export async function getAuthenticatedCalendarClient(workspaceId: string) {
  const tokenInfo = await getCalendarToken(workspaceId);

  if (!tokenInfo) {
    throw new Error('Google Calendar connector is not connected. Please connect Google Calendar with calendar permissions.');
  }

  const { token, tokenConnector } = tokenInfo;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = getConnectorRedirectUri('calendar');

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
      console.error(`[CALENDAR TOKEN REFRESH ERROR for workspace ${workspaceId}]:`, e);
    }
  });

  return {
    calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
    token,
  };
}

export class CalendarConnector implements SourceConnector {
  readonly id = 'calendar' as const;
  readonly name = 'Google Calendar';

  async health(workspaceId: string): Promise<ConnectorHealth> {
    const calStatus = await getTokenStatus(workspaceId, 'calendar');
    let isConnected = calStatus.connected;
    let revokedAt = calStatus.revoked_at;
    let requiresReconnect = calStatus.requires_reconnect;
    let lastRefreshError = calStatus.last_refresh_error;

    if (!isConnected && !requiresReconnect) {
      const gmailStatus = await getTokenStatus(workspaceId, 'gmail');
      if (gmailStatus.connected && gmailStatus.scopes?.some((s) => s.includes('calendar'))) {
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
              (SELECT last_error FROM sources WHERE workspace_id = $1 AND connector = 'calendar' AND last_error IS NOT NULL ORDER BY synced_at DESC LIMIT 1) AS last_error
       FROM sources 
       WHERE workspace_id = $1 AND connector = 'calendar'`,
      [workspaceId]
    );

    return {
      connected: isConnected,
      last_synced: sourceStats?.last_synced || null,
      last_error: lastRefreshError || sourceStats?.last_error || null,
      sync_window_days: DEFAULT_CALENDAR_WINDOW_DAYS,
      revoked_at: revokedAt,
      requires_reconnect: requiresReconnect,
      last_refresh_error: lastRefreshError,
    };
  }

  async list_changes(options: SyncOptions): Promise<SyncItem[]> {
    const { workspaceId, windowDays = DEFAULT_CALENDAR_WINDOW_DAYS, maxResults = 50 } = options;
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';
    const cutoffDate = new Date(Date.now() - windowDays * 86400000);

    const tokenInfo = await getCalendarToken(workspaceId);

    if (!tokenInfo && isMockAllowed) {
      return SAMPLE_CALENDAR_EVENTS.map((e) => {
        const content = formatCalendarContent(e);
        const checksum = createHash('sha256').update(content).digest('hex');
        return {
          externalId: e.id,
          checksum,
          date: e.start,
          subject: e.summary,
          snippet: e.description?.slice(0, 100) || e.summary,
        };
      });
    }

    if (!tokenInfo) {
      throw new Error('Google Calendar connector is not connected. Please connect Google Calendar with calendar permissions.');
    }

    const { calendar } = await getAuthenticatedCalendarClient(workspaceId);
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: cutoffDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults,
    });

    const items: SyncItem[] = [];
    for (const ev of res.data.items || []) {
      if (!ev.id) continue;
      const summary = ev.summary || 'Untitled Event';
      const start = ev.start?.dateTime || ev.start?.date || new Date().toISOString();
      const desc = ev.description || '';
      const checksum = createHash('sha256').update(`${ev.id}:${summary}:${start}:${desc}`).digest('hex');

      items.push({
        externalId: ev.id,
        checksum,
        date: start,
        subject: summary,
        snippet: desc.slice(0, 100) || summary,
      });
    }

    return items;
  }

  async fetch(workspaceId: string, externalId: string): Promise<FetchedDocument> {
    const isMockAllowed = process.env.EVAL_USE_MOCK === 'true' || process.env.NODE_ENV === 'test';

    if (externalId.startsWith('cal-event-') && isMockAllowed) {
      const ev = SAMPLE_CALENDAR_EVENTS.find((e) => e.id === externalId);
      if (ev) {
        const content = formatCalendarContent(ev);
        const checksum = createHash('sha256').update(content).digest('hex');
        return {
          externalId: ev.id,
          content,
          checksum,
          date: ev.start,
          meta: {
            summary: ev.summary,
            start: ev.start,
            end: ev.end,
            organizer: ev.organizer,
          },
        };
      }
    }

    const { calendar } = await getAuthenticatedCalendarClient(workspaceId);
    const res = await calendar.events.get({
      calendarId: 'primary',
      eventId: externalId,
    });

    const ev = res.data;
    const summary = ev.summary || 'Untitled Event';
    const start = ev.start?.dateTime || ev.start?.date || new Date().toISOString();
    const end = ev.end?.dateTime || ev.end?.date || start;
    const organizer = ev.organizer?.email || ev.organizer?.displayName || '';
    const location = ev.location || '';
    const description = ev.description || '';
    const attendees = (ev.attendees || []).map((a) => a.email || a.displayName || '').filter(Boolean);

    const payload: CalendarEventPayload = {
      id: externalId,
      summary,
      start,
      end,
      organizer,
      location,
      description,
      attendees,
    };

    const content = formatCalendarContent(payload);
    const checksum = createHash('sha256').update(content).digest('hex');

    return {
      externalId,
      content,
      checksum,
      date: start,
      meta: {
        summary,
        start,
        end,
        organizer,
        location,
        attendees,
      },
    };
  }

  async sync(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const { workspaceId, windowDays = DEFAULT_CALENDAR_WINDOW_DAYS } = options;

    try {
      const items = await this.list_changes(options);
      let syncedCount = 0;
      let unchangedCount = 0;
      const syncWindowStart = new Date(Date.now() - windowDays * 86400000).toISOString();

      for (const item of items) {
        const existing = await queryOne<{ id: string }>(
          `SELECT id FROM sources 
           WHERE workspace_id = $1 AND connector = 'calendar' AND checksum = $2`,
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
            ) VALUES ($1, 'calendar', $2, $3, 'untrusted_content', $4, NOW(), $5::jsonb)
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
            sourceName: doc.meta.summary || doc.externalId,
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
          `calendar_sync: window=${windowDays}d synced=${syncedCount} unchanged=${unchangedCount}`,
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
      const errorMessage = err.message || 'Calendar sync failed';

      await query(
        `UPDATE sources SET last_error = $2 WHERE workspace_id = $1 AND connector = 'calendar'`,
        [workspaceId, errorMessage]
      );

      await query(
        `INSERT INTO access_logs (
          workspace_id, source_id, brief_id, action
        ) VALUES ($1, null, null, $2)`,
        [workspaceId, `calendar_sync_error: ${errorMessage}`]
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
    await revokeToken(workspaceId, 'calendar');
    await query(
      `INSERT INTO access_logs (
        workspace_id, source_id, brief_id, action
      ) VALUES ($1, null, null, 'calendar_revoked')`,
      [workspaceId]
    );
  }
}

export const calendarConnector = new CalendarConnector();
