import crypto from 'crypto';
import { pool, query, queryOne } from '../src/db/client';
import {
  verifyGitHubSignature,
  verifySlackSignature,
  processGitHubWebhook,
  processSlackWebhook,
  processGenericWebhook,
  ingestWebhookDocument,
} from '../src/core/webhookHandler';

async function runTest() {
  console.log('=== Ballast M8: Real-Time Webhooks & Ingestion Test Suite ===\n');

  try {
    // ----------------------------------------------------
    // Test 1: Setup Test Workspace
    // ----------------------------------------------------
    console.log('[Test 1] Creating test workspace for webhooks...');
    const wsRes = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name, plan)
      VALUES ('M8 Webhooks Test Workspace', 'operator')
      RETURNING id;
    `);
    const workspaceId = wsRes.rows[0].id;
    console.log('  Created workspace:', workspaceId);

    // ----------------------------------------------------
    // Test 2: GitHub Webhook HMAC Signature Verification
    // ----------------------------------------------------
    console.log('\n[Test 2] Testing GitHub HMAC SHA-256 signature verification...');
    const ghSecret = 'test_github_webhook_secret_xyz123';
    const sampleGhPayload = JSON.stringify({ action: 'opened', issue: { number: 42 } });
    const validGhSig = 'sha256=' + crypto.createHmac('sha256', ghSecret).update(sampleGhPayload).digest('hex');
    const invalidGhSig = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

    if (!verifyGitHubSignature(sampleGhPayload, validGhSig, ghSecret)) {
      throw new Error('Valid GitHub signature was rejected');
    }
    if (verifyGitHubSignature(sampleGhPayload, invalidGhSig, ghSecret)) {
      throw new Error('Invalid GitHub signature was incorrectly accepted');
    }
    console.log('  Passed: GitHub HMAC signature verification strictly enforces authentication.');

    // ----------------------------------------------------
    // Test 3: Slack Webhook Signature & Replay Attack Prevention
    // ----------------------------------------------------
    console.log('\n[Test 3] Testing Slack Webhook signature and timestamp replay protection...');
    const slackSecret = 'test_slack_signing_secret_abc456';
    const sampleSlackPayload = JSON.stringify({ type: 'event_callback' });
    const currentTs = `${Math.floor(Date.now() / 1000)}`;
    const validSlackSig = 'v0=' + crypto.createHmac('sha256', slackSecret).update(`v0:${currentTs}:${sampleSlackPayload}`).digest('hex');

    if (!verifySlackSignature(sampleSlackPayload, validSlackSig, currentTs, slackSecret)) {
      throw new Error('Valid Slack signature was rejected');
    }

    // Expired timestamp (10 minutes ago)
    const expiredTs = `${Math.floor(Date.now() / 1000) - 600}`;
    const expiredSlackSig = 'v0=' + crypto.createHmac('sha256', slackSecret).update(`v0:${expiredTs}:${sampleSlackPayload}`).digest('hex');
    if (verifySlackSignature(sampleSlackPayload, expiredSlackSig, expiredTs, slackSecret)) {
      throw new Error('Expired timestamp signature must be rejected to prevent replay attacks');
    }
    console.log('  Passed: Slack signature verification correctly enforces validity and 5-minute replay window.');

    // ----------------------------------------------------
    // Test 4: Real-time GitHub Pull Request Ingestion & Vector Indexing
    // ----------------------------------------------------
    console.log('\n[Test 4] Testing real-time GitHub Pull Request event processing...');
    const fixedPrCreatedAt = '2026-09-17T00:00:00.000Z';
    const prResult = await processGitHubWebhook({
      workspaceId,
      event: 'pull_request',
      payload: {
        pull_request: {
          id: 991,
          number: 88,
          title: 'Add Real-time Webhook Receiver Engine',
          state: 'open',
          user: { login: 'octocat' },
          body: 'Implements instant webhook ingestion for GitHub PRs, Slack messages, and custom feeds.',
          created_at: fixedPrCreatedAt,
          html_url: 'https://github.com/acme/ballast/pull/88',
        },
        repository: {
          full_name: 'acme/ballast',
        },
      },
    });

    if (!prResult || !prResult.success || prResult.action !== 'created') {
      throw new Error(`Expected GitHub PR webhook to create source, got: ${JSON.stringify(prResult)}`);
    }

    // Verify source in DB
    const prSource = await queryOne<{ id: string; connector: string; external_id: string }>(
      `SELECT id, connector, external_id FROM sources WHERE id = $1`,
      [prResult.sourceId]
    );
    if (!prSource || prSource.connector !== 'github' || prSource.external_id !== 'acme/ballast#88') {
      throw new Error(`DB source mismatch for GitHub PR: ${JSON.stringify(prSource)}`);
    }

    // Verify chunks and embeddings generated in DB
    const prChunks = await query<{ id: string; text: string }>(
      `SELECT id, text FROM chunks WHERE source_id = $1`,
      [prResult.sourceId]
    );
    if (prChunks.length === 0) {
      throw new Error('Expected chunks and vector embeddings to be created for GitHub PR');
    }
    console.log(`  Passed: GitHub PR indexed in real time into source (${prSource.id}) with ${prChunks.length} embedded chunk(s).`);

    // ----------------------------------------------------
    // Test 5: Real-time Slack Message Event Ingestion
    // ----------------------------------------------------
    console.log('\n[Test 5] Testing real-time Slack message event processing...');
    const slackTs = `${Date.now() / 1000}`;
    const slackResult = await processSlackWebhook({
      workspaceId,
      payload: {
        type: 'event_callback',
        team_id: 'T12345',
        event: {
          type: 'message',
          channel: 'eng-alerts',
          user: 'U998877',
          text: 'Stripe webhook receiver successfully verified on production infrastructure.',
          ts: slackTs,
        },
      },
    });

    if (!slackResult || !slackResult.success || slackResult.action !== 'created') {
      throw new Error(`Expected Slack webhook to create source, got: ${JSON.stringify(slackResult)}`);
    }

    const slackSource = await queryOne<{ id: string; connector: string }>(
      `SELECT id, connector FROM sources WHERE id = $1`,
      [slackResult.sourceId]
    );
    if (!slackSource || slackSource.connector !== 'slack') {
      throw new Error(`DB source mismatch for Slack message`);
    }

    const slackChunks = await query<{ id: string }>(
      `SELECT id FROM chunks WHERE source_id = $1`,
      [slackResult.sourceId]
    );
    if (slackChunks.length === 0) {
      throw new Error('Expected chunks to be generated for Slack message');
    }
    console.log(`  Passed: Slack message indexed in real time with ${slackChunks.length} chunk(s).`);

    // ----------------------------------------------------
    // Test 6: Webhook Deduplication and Content Update Handling
    // ----------------------------------------------------
    console.log('\n[Test 6] Testing webhook deduplication and update mechanics...');
    // Re-send same PR without changes -> action should be 'unchanged'
    const unchangedResult = await processGitHubWebhook({
      workspaceId,
      event: 'pull_request',
      payload: {
        pull_request: {
          id: 991,
          number: 88,
          title: 'Add Real-time Webhook Receiver Engine',
          state: 'open',
          user: { login: 'octocat' },
          body: 'Implements instant webhook ingestion for GitHub PRs, Slack messages, and custom feeds.',
          created_at: fixedPrCreatedAt,
          html_url: 'https://github.com/acme/ballast/pull/88',
        },
        repository: {
          full_name: 'acme/ballast',
        },
      },
    });
    if (!unchangedResult || unchangedResult.action !== 'unchanged') {
      throw new Error(`Expected identical webhook to be unchanged, got: ${unchangedResult?.action}`);
    }

    // Send updated PR with modified body -> action should be 'updated'
    const updatedResult = await processGitHubWebhook({
      workspaceId,
      event: 'pull_request',
      payload: {
        pull_request: {
          id: 991,
          number: 88,
          title: 'Add Real-time Webhook Receiver Engine (Merged)',
          state: 'closed',
          user: { login: 'octocat' },
          body: 'PR approved and merged into main branch.',
          created_at: new Date().toISOString(),
          html_url: 'https://github.com/acme/ballast/pull/88',
        },
        repository: {
          full_name: 'acme/ballast',
        },
      },
    });
    if (!updatedResult || updatedResult.action !== 'updated') {
      throw new Error(`Expected updated webhook to be 'updated', got: ${updatedResult?.action}`);
    }
    console.log('  Passed: Deduplication and live content mutation verified.');

    // ----------------------------------------------------
    // Test 7: Generic Webhook Ingestion
    // ----------------------------------------------------
    console.log('\n[Test 7] Testing generic custom webhook payload ingestion...');
    const genericRes = await processGenericWebhook({
      workspaceId,
      externalId: 'custom-doc-001',
      title: 'Realtime Incident Report 101',
      content: 'Incident 101: Webhook throughput peak handled at 2,500 events/sec.',
      meta: { severity: 'low', env: 'production' },
    });
    if (!genericRes.success || genericRes.action !== 'created') {
      throw new Error('Generic webhook failed to ingest document');
    }
    console.log('  Passed: Generic webhook ingested and embedded.');

    // ----------------------------------------------------
    // Test 8: Audit Trail in access_logs
    // ----------------------------------------------------
    console.log('\n[Test 8] Verifying audit trail in access_logs...');
    const logs = await query<{ action: string }>(
      `SELECT action FROM access_logs WHERE workspace_id = $1 AND action LIKE 'webhook_sync:%'`,
      [workspaceId]
    );
    if (logs.length < 3) {
      throw new Error(`Expected at least 3 webhook audit logs, found: ${logs.length}`);
    }
    console.log(`  Passed: Found ${logs.length} webhook audit log entries.`);

    // Cleanup
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('\n  Cleaned up test workspace.');

    console.log('\n[PASS] All M8 real-time webhook sync tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] M8 test failed:', err);
  process.exit(1);
});
