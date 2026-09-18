import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();
process.env.EVAL_USE_MOCK = 'true';
process.env.NODE_ENV = 'test';

import { query, queryOne } from '../src/db/client';
import {
  createOutboundWebhook,
  updateOutboundWebhook,
  deleteOutboundWebhook,
  listOutboundWebhooks,
  getOutboundWebhook,
  signWebhookPayload,
  sendWebhookPayload,
  dispatchOutboundWebhook,
  testOutboundWebhook,
  validateWebhookUrl,
  generateWebhookSecret,
  SUPPORTED_OUTBOUND_EVENTS,
} from '../src/core/outboundWebhooks';
import type { OutboundWebhookRecord } from '../src/core/types';

async function runOutboundWebhooksTestSuite() {
  console.log('================================================================');
  console.log('  Ballast Feature E11: Outbound Webhooks Automation Test Suite   ');
  console.log('================================================================\n');

  const testWsId = 'e1100000-0000-0000-0000-000000000001';
  const testOtherWsId = 'e1100000-0000-0000-0000-000000000099';
  const testUserId = 'e1100000-0000-0000-0000-000000000002';

  // Spin up a local mock HTTP server to receive webhook dispatches
  const receivedRequests: Array<{
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: any;
    rawBody: string;
  }> = [];

  let serverResponseCode = 200;
  let serverResponseBody = JSON.stringify({ received: true });

  const mockServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
      receivedRequests.push({
        method: req.method || 'GET',
        url: req.url || '/',
        headers: req.headers,
        body: parsed,
        rawBody: raw,
      });

      res.writeHead(serverResponseCode, { 'Content-Type': 'application/json' });
      res.end(serverResponseBody);
    });
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = mockServer.address() as any;
  const mockServerUrl = `http://127.0.0.1:${address.port}/webhook-target`;
  console.log(`[Mock Server] Running on ${mockServerUrl}\n`);

  try {
    // -------------------------------------------------------------------------
    // Setup DB Baseline Fixtures
    // -------------------------------------------------------------------------
    console.log('[Setup] Provisioning test workspace and user...');
    await query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, 'e11user@ballast.local', 'hash_test', 'E11 Test User')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );

    await query(
      `INSERT INTO workspaces (id, name, plan)
       VALUES 
        ($1, 'E11 Primary Workspace', 'operator'),
        ($2, 'E11 Other Workspace', 'operator')
       ON CONFLICT (id) DO NOTHING`,
      [testWsId, testOtherWsId]
    );

    // Clean up any prior test webhooks
    await query(`DELETE FROM outbound_webhooks WHERE workspace_id IN ($1, $2)`, [testWsId, testOtherWsId]);

    // -------------------------------------------------------------------------
    // TEST 1: URL Validation & Secret Generation
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] URL Validation and Secret Generation');
    assert.strictEqual(validateWebhookUrl('https://example.com/hook').valid, true);
    assert.strictEqual(validateWebhookUrl('http://127.0.0.1:8080/hook').valid, true);
    assert.strictEqual(validateWebhookUrl('ftp://invalid.com').valid, false);
    assert.strictEqual(validateWebhookUrl('not-a-url').valid, false);

    const generatedSecret = generateWebhookSecret();
    assert.ok(generatedSecret.startsWith('whsec_'));
    assert.ok(generatedSecret.length > 20);
    console.log('✓ [Test 1 Passed] URL validation & secret generation work as expected.');

    // -------------------------------------------------------------------------
    // TEST 2: Webhook CRUD with Workspace Isolation
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Webhook CRUD with Workspace Isolation');

    const created1 = await createOutboundWebhook({
      workspaceId: testWsId,
      url: mockServerUrl,
      description: 'Zapier Production Dispatcher',
      events: ['brief.published', 'connector.synced'],
    });

    assert.ok(created1.id);
    assert.strictEqual(created1.workspace_id, testWsId);
    assert.strictEqual(created1.url, mockServerUrl);
    assert.strictEqual(created1.description, 'Zapier Production Dispatcher');
    assert.deepStrictEqual(created1.events, ['brief.published', 'connector.synced']);
    assert.strictEqual(created1.is_active, true);
    assert.ok(created1.secret.startsWith('whsec_'));

    // Create webhook in other workspace
    const createdOther = await createOutboundWebhook({
      workspaceId: testOtherWsId,
      url: 'https://other.com/webhook',
      events: ['brief.published'],
    });

    // Test list isolation
    const listWs1 = await listOutboundWebhooks(testWsId);
    assert.strictEqual(listWs1.length, 1);
    assert.strictEqual(listWs1[0].id, created1.id);

    const listWs2 = await listOutboundWebhooks(testOtherWsId);
    assert.strictEqual(listWs2.length, 1);
    assert.strictEqual(listWs2[0].id, createdOther.id);

    // Test update
    const updated = await updateOutboundWebhook({
      workspaceId: testWsId,
      id: created1.id,
      description: 'Updated Zapier Hook',
      events: ['*'],
      isActive: false,
    });
    assert.strictEqual(updated?.description, 'Updated Zapier Hook');
    assert.deepStrictEqual(updated?.events, ['*']);
    assert.strictEqual(updated?.is_active, false);

    // Cross-workspace update must return null (isolation)
    const crossUpdate = await updateOutboundWebhook({
      workspaceId: testOtherWsId,
      id: created1.id,
      description: 'Hacked',
    });
    assert.strictEqual(crossUpdate, null);

    // Restore to active
    await updateOutboundWebhook({
      workspaceId: testWsId,
      id: created1.id,
      isActive: true,
      events: ['brief.published', 'connector.synced'],
    });

    console.log('✓ [Test 2 Passed] Webhook CRUD with workspace isolation verified.');

    // -------------------------------------------------------------------------
    // TEST 3: Cryptographic HMAC SHA-256 Signatures
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Cryptographic HMAC SHA-256 Signatures');
    const samplePayload = JSON.stringify({ event: 'brief.published', data: { id: 'brief-123' } });
    const secret = 'whsec_test_secret_1234567890';
    const sig = signWebhookPayload(samplePayload, secret);
    assert.ok(sig.startsWith('sha256='));

    // Verify signature independently
    const expectedHex = crypto.createHmac('sha256', secret).update(samplePayload, 'utf8').digest('hex');
    assert.strictEqual(sig, `sha256=${expectedHex}`);
    console.log('✓ [Test 3 Passed] HMAC SHA-256 signature algorithm verified.');

    // -------------------------------------------------------------------------
    // TEST 4: Live HTTP Webhook Delivery & Header Verification
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Live HTTP Webhook Delivery & Header Verification');
    receivedRequests.length = 0;

    const deliveryResult = await sendWebhookPayload(
      created1,
      'brief.published',
      {
        brief_id: 'b-999',
        title: 'Executive AI Brief',
        summary: 'TLDR: Verified facts summary.',
      }
    );

    assert.strictEqual(deliveryResult.success, true);
    assert.strictEqual(deliveryResult.statusCode, 200);
    assert.ok(deliveryResult.latencyMs >= 0);
    assert.strictEqual(receivedRequests.length, 1);

    const receivedReq = receivedRequests[0];
    assert.strictEqual(receivedReq.method, 'POST');
    assert.strictEqual(receivedReq.headers['content-type'], 'application/json');
    assert.strictEqual(receivedReq.headers['user-agent'], 'Ballast-Webhooks/1.0');
    assert.strictEqual(receivedReq.headers['x-ballast-event'], 'brief.published');
    assert.ok(receivedReq.headers['x-ballast-delivery']);
    assert.ok(receivedReq.headers['x-ballast-timestamp']);
    assert.ok(receivedReq.headers['x-ballast-signature']?.toString().startsWith('sha256='));

    // Validate signature on received payload
    const signatureOnWire = receivedReq.headers['x-ballast-signature'] as string;
    const computedSig = signWebhookPayload(receivedReq.rawBody, created1.secret);
    assert.strictEqual(signatureOnWire, computedSig);

    // Verify DB updated with telemetry
    const refreshedWh = await getOutboundWebhook(testWsId, created1.id);
    assert.strictEqual(refreshedWh?.last_status_code, 200);
    assert.ok(refreshedWh?.last_triggered_at);
    assert.strictEqual(refreshedWh?.last_error, null);

    // Verify access_logs entry
    const accessLog = await queryOne<{ action: string }>(
      `SELECT action FROM access_logs 
       WHERE workspace_id = $1 AND action LIKE 'webhook_outbound:brief.published:success%'
       ORDER BY created_at DESC LIMIT 1`,
      [testWsId]
    );
    assert.ok(accessLog);
    console.log('✓ [Test 4 Passed] Live HTTP delivery and HMAC signature verification verified.');

    // -------------------------------------------------------------------------
    // TEST 5: Error and Timeout Handling
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Error Handling (HTTP 500, Network Failure)');
    
    // Simulate HTTP 500 from subscriber
    serverResponseCode = 500;
    serverResponseBody = JSON.stringify({ error: 'Internal Server Error on Subscriber' });

    const failDelivery = await sendWebhookPayload(
      created1,
      'brief.published',
      { test: true }
    );
    assert.strictEqual(failDelivery.success, false);
    assert.strictEqual(failDelivery.statusCode, 500);
    assert.ok(failDelivery.error?.includes('500'));

    const failRefreshed = await getOutboundWebhook(testWsId, created1.id);
    assert.strictEqual(failRefreshed?.last_status_code, 500);
    assert.ok(failRefreshed?.last_error?.includes('500'));

    // Reset mock server to 200
    serverResponseCode = 200;
    serverResponseBody = JSON.stringify({ ok: true });

    // Test dead URL without crashing
    const deadWh: OutboundWebhookRecord = {
      ...created1,
      url: 'http://127.0.0.1:1/nonexistent',
    };
    const networkFail = await sendWebhookPayload(deadWh, 'brief.published', { test: true });
    assert.strictEqual(networkFail.success, false);
    assert.ok(networkFail.error);
    console.log('✓ [Test 5 Passed] Robust error capture and non-blocking failure safety verified.');

    // -------------------------------------------------------------------------
    // TEST 6: Event Filtering & Parallel Multi-Webhook Dispatch
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Event Filtering & Parallel Dispatch');
    await query(`DELETE FROM outbound_webhooks WHERE workspace_id = $1`, [testWsId]);
    receivedRequests.length = 0;

    // Webhook A: Subscribed only to 'brief.published'
    const whBrief = await createOutboundWebhook({
      workspaceId: testWsId,
      url: `${mockServerUrl}?hook=brief`,
      events: ['brief.published'],
      description: 'Brief Only Hook',
    });

    // Webhook B: Subscribed only to 'connector.synced'
    const whSync = await createOutboundWebhook({
      workspaceId: testWsId,
      url: `${mockServerUrl}?hook=sync`,
      events: ['connector.synced'],
      description: 'Sync Only Hook',
    });

    // Webhook C: Wildcard '*'
    const whWildcard = await createOutboundWebhook({
      workspaceId: testWsId,
      url: `${mockServerUrl}?hook=all`,
      events: ['*'],
      description: 'Wildcard Hook',
    });

    // Webhook D: Disabled
    await createOutboundWebhook({
      workspaceId: testWsId,
      url: `${mockServerUrl}?hook=disabled`,
      events: ['*'],
      isActive: false,
    });

    // Dispatch 'brief.published' event
    const dispatchBrief = await dispatchOutboundWebhook({
      workspaceId: testWsId,
      event: 'brief.published',
      payload: { briefId: 'b-1', question: 'Status update?' },
    });

    assert.strictEqual(dispatchBrief.dispatched, 2); // whBrief + whWildcard
    assert.strictEqual(dispatchBrief.successful, 2);

    // Check URLs of received requests
    const briefReceivedUrls = receivedRequests.map((r) => r.url);
    assert.ok(briefReceivedUrls.some((u) => u.includes('hook=brief')));
    assert.ok(briefReceivedUrls.some((u) => u.includes('hook=all')));
    assert.ok(!briefReceivedUrls.some((u) => u.includes('hook=sync')));
    assert.ok(!briefReceivedUrls.some((u) => u.includes('hook=disabled')));

    // Dispatch 'connector.synced' event
    receivedRequests.length = 0;
    const dispatchSync = await dispatchOutboundWebhook({
      workspaceId: testWsId,
      event: 'connector.synced',
      payload: { connector: 'github', syncedCount: 5 },
    });

    assert.strictEqual(dispatchSync.dispatched, 2); // whSync + whWildcard
    assert.strictEqual(dispatchSync.successful, 2);

    const syncReceivedUrls = receivedRequests.map((r) => r.url);
    assert.ok(syncReceivedUrls.some((u) => u.includes('hook=sync')));
    assert.ok(syncReceivedUrls.some((u) => u.includes('hook=all')));
    assert.ok(!syncReceivedUrls.some((u) => u.includes('hook=brief')));

    console.log('✓ [Test 6 Passed] Event filtering and wildcard subscriptions verified.');

    // -------------------------------------------------------------------------
    // TEST 7: Diagnostic Test Webhook Ping
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Diagnostic Test Webhook Ping');
    receivedRequests.length = 0;

    const testPingRes = await testOutboundWebhook(testWsId, whBrief.id);
    assert.strictEqual(testPingRes.success, true);
    assert.strictEqual(testPingRes.statusCode, 200);
    assert.strictEqual(receivedRequests.length, 1);
    assert.strictEqual(receivedRequests[0].headers['x-ballast-event'], 'ballast.test');
    assert.strictEqual(receivedRequests[0].body.data.test, true);
    console.log('✓ [Test 7 Passed] Diagnostic test ping endpoint verified.');

    // -------------------------------------------------------------------------
    // TEST 8: Delete Webhook Cleanup
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Delete Webhook Cleanup');
    const deleted = await deleteOutboundWebhook(testWsId, whBrief.id);
    assert.strictEqual(deleted, true);

    const afterDelete = await getOutboundWebhook(testWsId, whBrief.id);
    assert.strictEqual(afterDelete, null);
    console.log('✓ [Test 8 Passed] Deletion verified.');

    console.log('\n================================================================');
    console.log('  ALL OUTBOUND WEBHOOKS (E11) TESTS PASSED SUCCESSFULLY! (8/8)  ');
    console.log('================================================================\n');
  } finally {
    mockServer.close();
  }
}

runOutboundWebhooksTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
