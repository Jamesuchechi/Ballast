import { randomUUID } from 'node:crypto';
import { query, queryOne, pool } from '../src/db/client';
import {
  encryptString,
  decryptString,
  storeEncryptedToken,
  getDecryptedToken,
  revokeToken,
  getTokenStatus,
} from '../src/connectors/tokenStore';
import { gmailConnector, SAMPLE_GMAIL_MESSAGES } from '../src/connectors/gmail';
import { processQueuedBrief } from '../src/core/pipelineWorker';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

async function runPhase3Tests() {
  console.log('=== BALLAST PHASE 3 VERIFICATION SUITE ===\n');

  const wsId = randomUUID();

  try {
    // 0. Setup test workspace
    await query(
      `INSERT INTO workspaces (id, name, plan) VALUES ($1, 'Phase 3 Workspace', 'pro')`,
      [wsId]
    );

    // 1. Token Encryption at Rest (FR1.3, NFR1.2)
    console.log('1. OAuth Token Encryption at Rest (AES-256-GCM):');
    const sensitiveToken = {
      access_token: 'ya29.a0AfH6SMD_secret_google_oauth_token_12345',
      refresh_token: '1//0gK_secret_refresh_token_67890',
      token_type: 'Bearer',
      expiry_date: Date.now() + 3600 * 1000,
    };

    const tokenId = await storeEncryptedToken(
      wsId,
      'gmail',
      sensitiveToken,
      ['https://www.googleapis.com/auth/gmail.readonly']
    );
    assert(Boolean(tokenId), 'Stored encrypted token record in oauth_tokens table');

    // Inspect database row directly to verify zero plaintext leakage
    const rawRow = await queryOne<{ encrypted_payload: string }>(
      `SELECT encrypted_payload FROM oauth_tokens WHERE id = $1`,
      [tokenId]
    );
    assert(Boolean(rawRow), 'Found raw oauth_tokens record');
    assert(
      !rawRow?.encrypted_payload.includes('ya29.a0AfH6SMD') &&
      !rawRow?.encrypted_payload.includes('secret_google'),
      'Plaintext credentials are NEVER stored in the database'
    );
    assert(
      (rawRow?.encrypted_payload.split(':').length || 0) === 3,
      'Stored envelope matches AES-256-GCM format (iv:tag:ciphertext)'
    );

    const decrypted = await getDecryptedToken<typeof sensitiveToken>(wsId, 'gmail');
    assert(
      decrypted?.access_token === sensitiveToken.access_token &&
      decrypted?.refresh_token === sensitiveToken.refresh_token,
      'Decrypted token perfectly matches original credentials'
    );

    // 2. Token Revocation Stops Future Sync (FR1.3)
    console.log('\n2. Token Revocation (FR1.3):');
    const statusBefore = await getTokenStatus(wsId, 'gmail');
    assert(statusBefore.connected === true && !statusBefore.revoked, 'Token status is active before revocation');

    await revokeToken(wsId, 'gmail');
    const statusAfter = await getTokenStatus(wsId, 'gmail');
    assert(statusAfter.connected === false && statusAfter.revoked === true, 'Token is marked revoked');

    const decryptedAfterRevoke = await getDecryptedToken(wsId, 'gmail');
    assert(decryptedAfterRevoke === null, 'Revoked token returns null, halting future sync');

    // Re-store active token for subsequent sync tests
    await storeEncryptedToken(
      wsId,
      'gmail',
      sensitiveToken,
      ['https://www.googleapis.com/auth/gmail.readonly']
    );

    // 3. Incremental Sync with 90-Day Window & Deduplication (FR2.1, FR2.10)
    console.log('\n3. Incremental Sync with 90-Day Window & Deduplication (FR2.1, FR2.10):');
    const sync1 = await gmailConnector.sync({
      workspaceId: wsId,
      windowDays: 90,
    });
    assert(sync1.syncedCount >= 3, `Initial sync ingested ${sync1.syncedCount} email threads`);
    assert(sync1.unchangedCount === 0, 'Zero unchanged items on initial sync');
    assert(sync1.windowDays === 90, 'Sync enforced default 90-day time window (FR2.1)');

    // Second sync: identical emails must be deduplicated by SHA-256 checksum (FR2.10)
    const sync2 = await gmailConnector.sync({
      workspaceId: wsId,
      windowDays: 90,
    });
    assert(sync2.syncedCount === 0, 'Second sync ingested 0 new items');
    assert(sync2.unchangedCount >= 3, `Second sync deduplicated ${sync2.unchangedCount} unchanged items without duplicating rows`);

    const sourcesCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM sources WHERE workspace_id = $1 AND connector = 'gmail'`,
      [wsId]
    );
    assert(parseInt(sourcesCount?.count || '0') === sync1.syncedCount, 'Database sources row count remains exactly deduplicated');

    // 4. Untrusted Content Boundary & Vector Chunking (FR3.1, FR3.5, NFR1.1)
    console.log('\n4. Untrusted Boundaries & Vector Chunking:');
    const sourceRow = await queryOne<{ trust_boundary: string; connector: string }>(
      `SELECT trust_boundary, connector FROM sources WHERE workspace_id = $1 AND connector = 'gmail' LIMIT 1`,
      [wsId]
    );
    assert(sourceRow?.trust_boundary === 'untrusted_content', 'Email sources strictly tagged trust_boundary=untrusted_content');
    assert(sourceRow?.connector === 'gmail', 'Source connector is tagged gmail');

    const chunksCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM chunks WHERE workspace_id = $1`,
      [wsId]
    );
    assert(parseInt(chunksCount?.count || '0') >= 3, `Emails successfully chunked and embedded in pgvector (${chunksCount?.count} chunks)`);

    // 5. Access Audit Logging (NFR2.4)
    console.log('\n5. Access Audit Logging (NFR2.4):');
    const syncAudit = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM access_logs WHERE workspace_id = $1 AND action LIKE 'gmail_sync%'`,
      [wsId]
    );
    assert(parseInt(syncAudit?.count || '0') >= 2, 'Access logs recorded entry for each incremental sync operation');

    // 6. Partial Failure & Rate-Limit Degradation (FR2.6, NFR4.1, NFR4.5)
    console.log('\n6. Partial Failure & Rate-Limit Degradation (FR2.6, NFR4.5):');
    // Simulate rate limit failure on Gmail connector
    const rateLimitSync = await gmailConnector.sync({
      workspaceId: wsId,
      simulateRateLimit: true,
    });
    assert(Boolean(rateLimitSync.error), 'Simulated rate limit was captured by connector');
    assert(rateLimitSync.error?.includes('429') ?? false, 'Error message identifies HTTP 429 rate limit');

    // Generate brief in workspace with failed connector
    const briefWithFailure = await query<{ id: string }>(
      `INSERT INTO briefs (
        workspace_id, question, mode, status, progress
      ) VALUES ($1, 'What is the deployment schedule for Stripe webhook?', 'home', 'queued', '[]'::jsonb)
      RETURNING id`,
      [wsId]
    );
    const failedBriefId = briefWithFailure[0].id;
    const processedFailedBrief = await processQueuedBrief(failedBriefId);

    assert(processedFailedBrief?.status === 'published', 'Brief published successfully despite connector degradation');
    assert(
      Boolean(processedFailedBrief?.markdown.includes('Could not be checked')),
      'Brief contains mandatory "### Could not be checked" heading'
    );
    assert(
      Boolean(processedFailedBrief?.markdown.toLowerCase().includes('gmail')),
      'Failed Gmail connector appears under Could not be checked and is never omitted quietly (FR2.6)'
    );

    const uncheckedCitation = await queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM citations WHERE brief_id = $1 AND citation_type = 'unchecked'`,
      [failedBriefId]
    );
    assert(parseInt(uncheckedCitation?.count || '0') >= 1, 'Persisted unchecked citation record for failed connector');

    // Reset last_error for exit criterion
    await query(`UPDATE sources SET last_error = NULL WHERE workspace_id = $1`, [wsId]);

    // 7. Exit Criterion: Grounded Home Brief on "What's on me this week" (Exit Criterion Phase 3)
    console.log('\n7. Phase 3 Exit Criterion Demonstration:');
    const exitBriefRows = await query<{ id: string }>(
      `INSERT INTO briefs (
        workspace_id, question, mode, status, progress
      ) VALUES ($1, 'What is on me this week from my inbox?', 'home', 'queued', '[]'::jsonb)
      RETURNING id`,
      [wsId]
    );
    const exitBriefId = exitBriefRows[0].id;
    const exitBriefRes = await processQueuedBrief(exitBriefId);

    assert(exitBriefRes?.status === 'published', 'Home brief status is published');
    assert(
      Boolean(
        exitBriefRes?.markdown.includes('Stripe') ||
        exitBriefRes?.markdown.includes('Alex') ||
        exitBriefRes?.markdown.includes('Elena')
      ),
      'Brief evidence lines quote the real synced email thread'
    );

    const health = await gmailConnector.health(wsId);
    assert(health.connected === true, 'Connector health reports connected');
    assert(Boolean(health.last_synced), 'Visible last-synced time is recorded and returned in health status');

  } finally {
    // Cleanup test workspace
    await query(`DELETE FROM workspaces WHERE id = $1`, [wsId]);
  }

  console.log('\n==========================================');
  console.log(`Phase 3 Tests Passed: ${passed} | Tests Failed: ${failed}`);
  console.log('==========================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runPhase3Tests().catch(async (err) => {
  console.error('Unhandled Phase 3 suite error:', err);
  await pool.end();
  process.exit(1);
});
