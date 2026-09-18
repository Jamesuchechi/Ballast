import crypto from 'crypto';
import { query, queryOne } from '@/db/client';
import type { OutboundWebhookEvent, OutboundWebhookRecord } from './types';

export const SUPPORTED_OUTBOUND_EVENTS: OutboundWebhookEvent[] = [
  'brief.published',
  'brief.failed',
  'connector.synced',
  'action.proposed',
  'action.executed',
  '*',
];

/**
 * Generates a high-entropy secret for webhook HMAC-SHA256 signatures.
 */
export function generateWebhookSecret(): string {
  return 'whsec_' + crypto.randomBytes(24).toString('hex');
}

/**
 * Validates whether a given URL is a valid http/https destination.
 */
export function validateWebhookUrl(urlStr: string): { valid: boolean; error?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { valid: false, error: 'Webhook URL is required.' };
  }
  try {
    const parsed = new URL(urlStr.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Webhook URL must use http or https protocol.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid Webhook URL format.' };
  }
}

/**
 * Computes HMAC-SHA256 signature for outbound webhook payload string.
 */
export function signWebhookPayload(payloadStr: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadStr, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

export interface CreateWebhookParams {
  workspaceId: string;
  url: string;
  secret?: string;
  events?: OutboundWebhookEvent[];
  description?: string;
  isActive?: boolean;
}

/**
 * Creates a new outbound webhook subscription.
 */
export async function createOutboundWebhook(
  params: CreateWebhookParams
): Promise<OutboundWebhookRecord> {
  const { workspaceId, url, description, isActive = true } = params;

  const urlValidation = validateWebhookUrl(url);
  if (!urlValidation.valid) {
    throw new Error(urlValidation.error || 'Invalid webhook URL');
  }

  const rawEvents = params.events && params.events.length > 0 ? params.events : ['brief.published'];
  const validEvents = rawEvents.filter((e): e is OutboundWebhookEvent => (SUPPORTED_OUTBOUND_EVENTS as readonly string[]).includes(e));
  if (validEvents.length === 0) {
    throw new Error('At least one valid event subscription must be selected.');
  }

  const secret = params.secret?.trim() || generateWebhookSecret();

  const rows = await query<OutboundWebhookRecord>(
    `INSERT INTO outbound_webhooks (
      workspace_id, url, secret, events, description, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      workspaceId,
      url.trim(),
      secret,
      validEvents,
      description?.trim() || null,
      isActive,
    ]
  );

  return rows[0];
}

export interface UpdateWebhookParams {
  workspaceId: string;
  id: string;
  url?: string;
  secret?: string;
  events?: OutboundWebhookEvent[];
  description?: string | null;
  isActive?: boolean;
}

/**
 * Updates an existing outbound webhook subscription.
 */
export async function updateOutboundWebhook(
  params: UpdateWebhookParams
): Promise<OutboundWebhookRecord | null> {
  const { workspaceId, id, url, secret, events, description, isActive } = params;

  // Verify ownership
  const existing = await queryOne<OutboundWebhookRecord>(
    `SELECT * FROM outbound_webhooks WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
  if (!existing) return null;

  let newUrl = existing.url;
  if (url !== undefined) {
    const urlValidation = validateWebhookUrl(url);
    if (!urlValidation.valid) {
      throw new Error(urlValidation.error || 'Invalid webhook URL');
    }
    newUrl = url.trim();
  }

  let newEvents = existing.events;
  if (events !== undefined) {
    const validEvents = events.filter((e): e is OutboundWebhookEvent => (SUPPORTED_OUTBOUND_EVENTS as readonly string[]).includes(e));
    if (validEvents.length === 0) {
      throw new Error('At least one valid event subscription must be selected.');
    }
    newEvents = validEvents;
  }

  const newSecret = secret !== undefined ? (secret.trim() || generateWebhookSecret()) : existing.secret;
  const newDescription = description !== undefined ? description : existing.description;
  const newActive = isActive !== undefined ? isActive : existing.is_active;

  const rows = await query<OutboundWebhookRecord>(
    `UPDATE outbound_webhooks
     SET url = $1, secret = $2, events = $3, description = $4, is_active = $5, updated_at = NOW()
     WHERE id = $6 AND workspace_id = $7
     RETURNING *`,
    [newUrl, newSecret, newEvents, newDescription, newActive, id, workspaceId]
  );

  return rows[0] || null;
}

/**
 * Deletes an outbound webhook subscription.
 */
export async function deleteOutboundWebhook(
  workspaceId: string,
  id: string
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM outbound_webhooks WHERE id = $1 AND workspace_id = $2 RETURNING id`,
    [id, workspaceId]
  );
  return rows.length > 0;
}


/**
 * Lists all configured outbound webhooks for a workspace.
 */
export async function listOutboundWebhooks(
  workspaceId: string
): Promise<OutboundWebhookRecord[]> {
  return query<OutboundWebhookRecord>(
    `SELECT * FROM outbound_webhooks 
     WHERE workspace_id = $1 
     ORDER BY created_at DESC`,
    [workspaceId]
  );
}

/**
 * Retrieves a single outbound webhook by ID.
 */
export async function getOutboundWebhook(
  workspaceId: string,
  id: string
): Promise<OutboundWebhookRecord | null> {
  return queryOne<OutboundWebhookRecord>(
    `SELECT * FROM outbound_webhooks 
     WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
}

export interface WebhookDeliveryResult {
  webhookId: string;
  url: string;
  event: OutboundWebhookEvent;
  success: boolean;
  statusCode?: number;
  latencyMs: number;
  responseSnippet?: string;
  error?: string;
}

/**
 * Executes a single HTTP POST delivery to a webhook subscriber with timeout, HMAC header, and status recording.
 */
export async function sendWebhookPayload(
  webhook: OutboundWebhookRecord,
  event: OutboundWebhookEvent,
  payload: any,
  deliveryId: string = crypto.randomUUID()
): Promise<WebhookDeliveryResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  const envelope = {
    id: deliveryId,
    event,
    workspace_id: webhook.workspace_id,
    created_at: timestamp,
    data: payload,
  };

  const payloadString = JSON.stringify(envelope);
  const signature = signWebhookPayload(payloadString, webhook.secret);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s safety timeout

  let statusCode: number | undefined;
  let responseSnippet: string | undefined;
  let errorMsg: string | undefined;
  let success = false;

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Ballast-Webhooks/1.0',
        'X-Ballast-Event': event,
        'X-Ballast-Delivery': deliveryId,
        'X-Ballast-Timestamp': timestamp,
        'X-Ballast-Signature': signature,
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    statusCode = res.status;
    success = res.ok; // 2xx status codes

    const rawText = await res.text().catch(() => '');
    responseSnippet = rawText.slice(0, 500);

    if (!res.ok) {
      errorMsg = `HTTP ${res.status}: ${res.statusText || 'Destination rejected payload'}`;
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    success = false;
    errorMsg = err.name === 'AbortError' ? 'Delivery timed out after 10000ms' : (err.message || 'Network connection failed');
  }

  const latencyMs = Date.now() - startTime;

  // Persist delivery telemetry into outbound_webhooks table
  try {
    await query(
      `UPDATE outbound_webhooks 
       SET last_triggered_at = NOW(), 
           last_status_code = $1, 
           last_error = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [statusCode || null, errorMsg || null, webhook.id]
    );

    // Audit log
    await query(
      `INSERT INTO access_logs (workspace_id, action)
       VALUES ($1, $2)`,
      [
        webhook.workspace_id,
        `webhook_outbound:${event}:${success ? 'success' : 'failed'} status=${statusCode || 'none'} latency=${latencyMs}ms url=${webhook.url.slice(0, 80)}`,
      ]
    );
  } catch (logErr) {
    console.warn('[Outbound Webhooks] Failed to update telemetry/access_logs:', logErr);
  }

  return {
    webhookId: webhook.id,
    url: webhook.url,
    event,
    success,
    statusCode,
    latencyMs,
    responseSnippet,
    error: errorMsg,
  };
}

/**
 * Dispatches an event payload in parallel to all active webhooks registered for the given workspace.
 * Failsafe: never throws or crashes caller execution.
 */
export async function dispatchOutboundWebhook(params: {
  workspaceId: string;
  event: OutboundWebhookEvent;
  payload: any;
}): Promise<{ dispatched: number; successful: number; failed: number; results: WebhookDeliveryResult[] }> {
  const { workspaceId, event, payload } = params;

  try {
    // Query active webhooks subscribed to this specific event or '*'
    const webhooks = await query<OutboundWebhookRecord>(
      `SELECT * FROM outbound_webhooks 
       WHERE workspace_id = $1 
         AND is_active = true 
         AND (events @> ARRAY[$2::text] OR events @> ARRAY['*']::text[])`,
      [workspaceId, event]
    );

    if (webhooks.length === 0) {
      return { dispatched: 0, successful: 0, failed: 0, results: [] };
    }

    const deliveryId = crypto.randomUUID();
    const deliveryPromises = webhooks.map((wh) =>
      sendWebhookPayload(wh, event, payload, deliveryId)
    );

    const outcomes = await Promise.allSettled(deliveryPromises);
    const results: WebhookDeliveryResult[] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < outcomes.length; i++) {
      const outcome = outcomes[i];
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
        if (outcome.value.success) {
          successful++;
        } else {
          failed++;
        }
      } else {
        failed++;
        results.push({
          webhookId: webhooks[i].id,
          url: webhooks[i].url,
          event,
          success: false,
          latencyMs: 0,
          error: outcome.reason?.message || 'Unknown dispatch failure',
        });
      }
    }

    return {
      dispatched: webhooks.length,
      successful,
      failed,
      results,
    };
  } catch (err) {
    console.error('[Outbound Webhook Dispatch Error]:', err);
    return { dispatched: 0, successful: 0, failed: 0, results: [] };
  }
}

/**
 * Tests an outbound webhook by sending an immediate diagnostic ping payload.
 */
export async function testOutboundWebhook(
  workspaceId: string,
  id: string
): Promise<WebhookDeliveryResult> {
  const webhook = await getOutboundWebhook(workspaceId, id);
  if (!webhook) {
    throw new Error('Webhook configuration not found');
  }

  const testPayload = {
    test: true,
    message: 'Ballast Outbound Webhook Test Dispatch',
    timestamp: new Date().toISOString(),
    workspace_id: workspaceId,
    subscribed_events: webhook.events,
  };

  return sendWebhookPayload(webhook, 'ballast.test', testPayload);
}
