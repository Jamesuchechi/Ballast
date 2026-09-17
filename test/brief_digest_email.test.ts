import {
  buildWorkspaceDigest,
  renderDigestEmailHtml,
  renderDigestEmailText,
  sendWorkspaceDigest,
  checkAndTriggerDueDigests,
  previewWorkspaceDigest,
} from '../src/core/digestService';
import { pool, query, queryOne } from '../src/db/client';
import { checkAndTriggerDueDigestsPass } from '../src/worker';

async function runTest() {
  console.log('=== Ballast E2: Brief Digest / Weekly Summary Email Test Suite ===\n');

  let testWorkspaceId: string | null = null;
  let testUserId1: string | null = null;
  let testUserId2: string | null = null;

  try {
    // Setup Test Workspace and Users
    const wsRes = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name, plan)
      VALUES ('E2 Digest Test Corp', 'operator')
      RETURNING id;
    `);
    testWorkspaceId = wsRes.rows[0].id;

    // User 1: Subscribed to Weekly Digest (default)
    const user1Res = await pool.query<{ id: string }>(`
      INSERT INTO users (email, name, password_hash, notification_preferences)
      VALUES ($1, 'Elena Rostova', 'hash123', $2)
      RETURNING id;
    `, [
      `elena_${Date.now()}@ballast-test.io`,
      JSON.stringify({
        email_enabled: true,
        notify_on_publish: false,
        digest_enabled: true,
        digest_frequency: 'weekly',
        digest_day: 'monday',
      }),
    ]);
    testUserId1 = user1Res.rows[0].id;

    // User 2: Opted Out of Weekly Digest
    const user2Res = await pool.query<{ id: string }>(`
      INSERT INTO users (email, name, password_hash, notification_preferences)
      VALUES ($1, 'Marcus Vance', 'hash123', $2)
      RETURNING id;
    `, [
      `marcus_${Date.now()}@ballast-test.io`,
      JSON.stringify({
        email_enabled: true,
        digest_enabled: false,
      }),
    ]);
    testUserId2 = user2Res.rows[0].id;

    // Associate users with workspace
    await pool.query(`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES ($1, $2, 'owner'), ($1, $3, 'member');
    `, [testWorkspaceId, testUserId1, testUserId2]);

    // ----------------------------------------------------
    // Test 1: Empty Workspace Handling
    // ----------------------------------------------------
    console.log('[Test 1] Testing digest compilation on empty workspace (0 briefs)...');
    const emptyDigest = await buildWorkspaceDigest(testWorkspaceId, { lookbackDays: 7 });
    if (emptyDigest.totalBriefs !== 0 || emptyDigest.briefs.length !== 0) {
      throw new Error(`Expected 0 briefs in empty workspace, got ${emptyDigest.totalBriefs}`);
    }
    const emptySendResult = await sendWorkspaceDigest({
      workspaceId: testWorkspaceId,
      lookbackDays: 7,
      force: false,
    });
    if (emptySendResult.sent !== false || emptySendResult.reason !== 'no_briefs_in_window') {
      throw new Error(`Expected clean skip on empty workspace without force, got ${JSON.stringify(emptySendResult)}`);
    }
    console.log('  Passed: Empty workspace cleanly skips automated dispatch without errors.');

    // ----------------------------------------------------
    // Test 2: Seed Published Briefs, Citations & Proposed Actions
    // ----------------------------------------------------
    console.log('\n[Test 2] Seeding published briefs, citations, and actions into workspace...');
    
    // Brief 1: Infrastructure status
    const b1 = await pool.query<{ id: string }>(`
      INSERT INTO briefs (workspace_id, question, mode, status, summary, template_version, created_at)
      VALUES ($1, 'What is the current AWS to GCP migration progress?', 'home', 'published', 'Migration completed ahead of schedule with 99.99% uptime across all microservices.', 'v1', NOW() - INTERVAL '2 days')
      RETURNING id;
    `, [testWorkspaceId]);
    const briefId1 = b1.rows[0].id;

    // Citations for Brief 1
    await pool.query(`
      INSERT INTO citations (workspace_id, brief_id, source_class, citation_type, claim_span, quote)
      VALUES 
        ($1, $2, 'private', 'support', '{"start": 0, "end": 10}'::jsonb, 'Cluster cutover succeeded at 04:00 UTC.'),
        ($1, $2, 'private', 'support', '{"start": 11, "end": 20}'::jsonb, 'Latency reduced by 34ms.');
    `, [testWorkspaceId, briefId1]);

    // Action for Brief 1
    await pool.query(`
      INSERT INTO actions (workspace_id, brief_id, type, payload)
      VALUES ($1, $2, 'email_draft', $3);
    `, [
      testWorkspaceId,
      briefId1,
      JSON.stringify({
        to: 'team@infra.internal',
        subject: 'AWS cutover post-mortem review',
        body: 'Please review the latency metric improvements from the cloud migration.',
      }),
    ]);

    // Brief 2: Security SOC2 Audit
    const b2 = await pool.query<{ id: string }>(`
      INSERT INTO briefs (workspace_id, question, mode, status, summary, template_version, created_at)
      VALUES ($1, 'What were the findings in the Q3 SOC2 compliance audit?', 'world', 'published', 'SOC2 Type II compliance audit concluded with zero major non-conformities.', 'v1', NOW() - INTERVAL '4 days')
      RETURNING id;
    `, [testWorkspaceId]);
    const briefId2 = b2.rows[0].id;

    // Citation for Brief 2
    await pool.query(`
      INSERT INTO citations (workspace_id, brief_id, source_class, citation_type, claim_span, quote)
      VALUES ($1, $2, 'web', 'support', '{"start": 0, "end": 10}'::jsonb, 'All security controls verified.');
    `, [testWorkspaceId, briefId2]);

    // Action for Brief 2
    await pool.query(`
      INSERT INTO actions (workspace_id, brief_id, type, payload, executed_at)
      VALUES ($1, $2, 'issue_draft', $3, NOW());
    `, [
      testWorkspaceId,
      briefId2,
      JSON.stringify({
        repo: 'org/security-policies',
        title: 'Publish annual SOC2 auditor certificate',
        summary: 'Upload signed compliance PDF to customer trust center.',
      }),
    ]);

    // ----------------------------------------------------
    // Test 3: Digest Compilation & Metrics Rollup
    // ----------------------------------------------------
    console.log('\n[Test 3] Testing digest compilation and metrics calculation across lookback period...');
    const digestData = await buildWorkspaceDigest(testWorkspaceId, { lookbackDays: 7 });

    if (digestData.totalBriefs !== 2) {
      throw new Error(`Expected totalBriefs = 2, got ${digestData.totalBriefs}`);
    }
    if (digestData.totalClaims !== 3) {
      throw new Error(`Expected totalClaims = 3 (2 from brief 1, 1 from brief 2), got ${digestData.totalClaims}`);
    }
    if (digestData.totalActions !== 2) {
      throw new Error(`Expected totalActions = 2, got ${digestData.totalActions}`);
    }
    if (digestData.summaryHighlights.length !== 2) {
      throw new Error(`Expected 2 summary highlights, got ${digestData.summaryHighlights.length}`);
    }
    console.log(`  Passed: Aggregated ${digestData.totalBriefs} briefs, ${digestData.totalClaims} verified claims, and ${digestData.totalActions} actions.`);

    // ----------------------------------------------------
    // Test 4: HTML & Plaintext Email Rendering with XSS Sanitization
    // ----------------------------------------------------
    console.log('\n[Test 4] Testing HTML and Plaintext email rendering with Security S5 HTML escaping...');
    const htmlOutput = renderDigestEmailHtml(digestData, 'https://ballast.app');
    const textOutput = renderDigestEmailText(digestData, 'https://ballast.app');

    if (!htmlOutput.includes('E2 Digest Test Corp') || !htmlOutput.includes('Weekly Intelligence Digest')) {
      throw new Error('Rendered HTML missing workspace name or digest title');
    }
    if (!htmlOutput.includes('TL;DR:') || !htmlOutput.includes('Migration completed ahead of schedule')) {
      throw new Error('Rendered HTML missing brief summary TL;DR callout');
    }
    if (!htmlOutput.includes('Proposed &amp; Pending Actions') || !htmlOutput.includes('AWS cutover post-mortem review')) {
      throw new Error('Rendered HTML missing proposed actions rollup');
    }
    if (!textOutput.includes('BALLAST / WEEKLY INTELLIGENCE DIGEST') || !textOutput.includes('Total Verified Claims: 3')) {
      throw new Error('Rendered Plaintext missing required rollup sections');
    }
    console.log('  Passed: HTML and Plaintext email templates rendered cleanly with all sections and metadata.');

    // ----------------------------------------------------
    // Test 5: User Notification Preference Filtering
    // ----------------------------------------------------
    console.log('\n[Test 5] Testing recipient preference filtering (opt-in vs opt-out)...');
    const sendResult = await sendWorkspaceDigest({
      workspaceId: testWorkspaceId,
      lookbackDays: 7,
      force: true,
    });

    if (!sendResult.sent) {
      throw new Error(`Expected digest to be dispatched, got ${JSON.stringify(sendResult)}`);
    }
    if (sendResult.recipientCount !== 1) {
      throw new Error(`Expected exactly 1 recipient (User 1 opted in, User 2 opted out), got ${sendResult.recipientCount}`);
    }
    if (!sendResult.recipients[0].startsWith('elena_')) {
      throw new Error(`Expected User 1 (Elena) to receive digest, got ${sendResult.recipients[0]}`);
    }
    console.log(`  Passed: Correctly delivered only to opted-in member: ${sendResult.recipients.join(', ')}`);

    // ----------------------------------------------------
    // Test 6: Audit Trail & Double-Send Guard
    // ----------------------------------------------------
    console.log('\n[Test 6] Testing access_logs audit logging and double-send prevention...');
    const logRow = await queryOne<{ action: string }>(
      `SELECT action FROM access_logs 
       WHERE workspace_id = $1 AND action LIKE 'digest_sent:weekly%'
       ORDER BY created_at DESC LIMIT 1`,
      [testWorkspaceId]
    );

    if (!logRow || !logRow.action.startsWith('digest_sent:weekly')) {
      throw new Error(`Expected digest dispatch audit log in access_logs table, got ${logRow?.action}`);
    }

    // Now run checkAndTriggerDueDigests - should skip because it was just sent
    const triggeredCount = await checkAndTriggerDueDigests(testWorkspaceId);
    if (triggeredCount !== 0) {
      throw new Error(`Expected 0 triggered digests due to double-send guard, got ${triggeredCount}`);
    }
    console.log('  Passed: Audit log recorded in access_logs and double-send guard confirmed (0 triggered).');

    // ----------------------------------------------------
    // Test 7: Worker Digest Pass Integration
    // ----------------------------------------------------
    console.log('\n[Test 7] Testing worker checkAndTriggerDueDigestsPass wrapper...');
    const workerPassResult = await checkAndTriggerDueDigestsPass();
    if (typeof workerPassResult !== 'number') {
      throw new Error('Worker pass did not return numeric dispatch count');
    }
    console.log(`  Passed: Worker digest loop executed safely without throwing.`);

    // ----------------------------------------------------
    // Test 8: Preview Digest API Helper
    // ----------------------------------------------------
    console.log('\n[Test 8] Testing previewWorkspaceDigest helper for UI modal...');
    const preview = await previewWorkspaceDigest(testWorkspaceId, 7);
    if (!preview.data || !preview.html || !preview.text) {
      throw new Error('previewWorkspaceDigest missing expected data or template strings');
    }
    if (preview.data.totalBriefs !== 2) {
      throw new Error(`Preview data mismatch: expected 2 briefs, got ${preview.data.totalBriefs}`);
    }
    console.log('  Passed: Preview helper generated full payload for dashboard modal preview.');

    console.log('\n[PASS] All E2 Brief Digest / Weekly Summary Email tests passed successfully!\n');
  } finally {
    // Cleanup test data
    if (testWorkspaceId) {
      await pool.query(`DELETE FROM workspaces WHERE id = $1`, [testWorkspaceId]);
      console.log('Cleaned up test workspace and members.');
    }
    await pool.end();
  }
}

runTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('[FAIL] E2 test failed:', err);
  process.exit(1);
});
