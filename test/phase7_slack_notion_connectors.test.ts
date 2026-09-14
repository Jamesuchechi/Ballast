import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import { query, queryOne } from '../src/db/client';
import { CONNECTOR_REGISTRY, getConnector } from '../src/connectors/registry';
import { slackConnector, SlackConnector } from '../src/connectors/slack';
import { notionConnector, NotionConnector, renderNotionBlock } from '../src/connectors/notion';
import { storeEncryptedToken, getTokenStatus } from '../src/connectors/tokenStore';
import { runCritic, evaluateCriticDeterministicForEval } from '../src/core/critic';
import type { CriticInput, RetrievedQuote, DraftBrief } from '../src/core/types';

async function runPhase7TestSuite() {
  console.log('================================================================');
  console.log('  Ballast: Slack + Notion Connectors & Cross-Source Conflicts  ');
  console.log('================================================================\n');

  const testWsId = 'b7000000-0000-0000-0000-000000000001';
  const testBriefId = 'b7000000-0000-0000-0000-000000000002';
  const testUserId = 'b7000000-0000-0000-0000-000000000003';

  try {
    // -------------------------------------------------------------------------
    // Setup DB baseline fixtures
    // -------------------------------------------------------------------------
    await query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, 'phase7@ballast.local', 'hash_test', 'Phase 7 User')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );

    await query(
      `INSERT INTO workspaces (id, name, plan)
       VALUES ($1, 'Phase 7 Workspace', 'operator')
       ON CONFLICT (id) DO UPDATE SET plan = 'operator'`,
      [testWsId]
    );

    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [testWsId, testUserId]
    );

    // Clean up test workspace artifacts from any previous run
    await query(`DELETE FROM chunks WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM sources WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [testWsId]);
    await query(`DELETE FROM oauth_tokens WHERE workspace_id = $1`, [testWsId]);

    // =========================================================================
    // Part 1: Registry Completeness & Contract Compliance
    // =========================================================================
    console.log('[Test 1] Verifying Slack and Notion in CONNECTOR_REGISTRY...');
    const slackDef = CONNECTOR_REGISTRY.find((c) => c.id === 'slack');
    const notionDef = CONNECTOR_REGISTRY.find((c) => c.id === 'notion');

    assert.ok(slackDef, 'Slack must be registered in CONNECTOR_REGISTRY');
    assert.equal(slackDef.name, 'Slack');
    assert.ok(slackDef.scopes.includes('channels:history'));
    assert.ok(slackDef.connector instanceof SlackConnector);

    assert.ok(notionDef, 'Notion must be registered in CONNECTOR_REGISTRY');
    assert.equal(notionDef.name, 'Notion');
    assert.ok(notionDef.connector instanceof NotionConnector);
    console.log('✓ Verified: Slack and Notion strictly satisfy CONNECTOR_REGISTRY standards.');

    // =========================================================================
    // Part 2: Production De-mocking Strictness (Must Throw Loudly)
    // =========================================================================
    console.log('\n[Test 2] Verifying loud failure in production when unauthenticated...');
    const origMock = process.env.EVAL_USE_MOCK;
    const origEnv = process.env.NODE_ENV;

    try {
      process.env.EVAL_USE_MOCK = 'false';
      (process.env as any).NODE_ENV = 'production';

      const unauthWs = 'ws_unauth_fake_phase7';

      let slackThrew = false;
      try {
        await slackConnector.list_changes({ workspaceId: unauthWs });
      } catch (err: any) {
        slackThrew = true;
        assert.match(err.message, /not connected or token has been revoked/i);
      }
      assert.ok(slackThrew, 'Slack list_changes must throw in production without token');

      let notionThrew = false;
      try {
        await notionConnector.list_changes({ workspaceId: unauthWs });
      } catch (err: any) {
        notionThrew = true;
        assert.match(err.message, /not connected or token has been revoked/i);
      }
      assert.ok(notionThrew, 'Notion list_changes must throw in production without token');

      console.log('✓ Verified: Silent mock fallbacks strictly prohibited in production.');
    } finally {
      process.env.EVAL_USE_MOCK = origMock;
      (process.env as any).NODE_ENV = origEnv;
    }

    // =========================================================================
    // Part 3: Token Encryption & Health Status
    // =========================================================================
    console.log('\n[Test 3] Testing token encryption and health checks...');
    await storeEncryptedToken(
      testWsId,
      'slack',
      { access_token: 'xoxp-mock-slack-token-test', authed_user: { id: 'U12345' } },
      ['channels:history', 'channels:read']
    );

    await storeEncryptedToken(
      testWsId,
      'notion',
      { access_token: 'secret_mock_notion_token_test', token_type: 'Bearer' },
      ['read_content']
    );

    const slackHealth = await slackConnector.health(testWsId);
    assert.equal(slackHealth.connected, true, 'Slack health should report connected');
    assert.equal(slackHealth.sync_window_days, 30);

    const notionHealth = await notionConnector.health(testWsId);
    assert.equal(notionHealth.connected, true, 'Notion health should report connected');
    assert.equal(notionHealth.sync_window_days, 90);

    console.log('✓ Verified: Encrypted token store and health reporting operational.');

    // =========================================================================
    // Part 4: Notion Block Markdown Parser
    // =========================================================================
    console.log('\n[Test 4] Testing Notion block renderer...');
    assert.equal(renderNotionBlock({ type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Title' }] } }), '# Title');
    assert.equal(renderNotionBlock({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: 'Item' }] } }), '- Item');
    assert.equal(renderNotionBlock({ type: 'to_do', to_do: { checked: true, rich_text: [{ plain_text: 'Done task' }] } }), '[x] Done task');
    assert.equal(renderNotionBlock({ type: 'callout', callout: { rich_text: [{ plain_text: 'Important info' }] } }), '> 💡 Important info');
    console.log('✓ Verified: Notion block types render faithfully into markdown.');

    // =========================================================================
    // Part 5: Ingestion, Chunking & Audit Logs (Test Mode)
    // =========================================================================
    console.log('\n[Test 5] Testing Slack and Notion sync & ingestion...');
    process.env.EVAL_USE_MOCK = 'true';

    const slackSyncResult = await slackConnector.sync({ workspaceId: testWsId });
    assert.ok(slackSyncResult.syncedCount >= 2, 'Slack sync must ingest sample messages');
    assert.equal(slackSyncResult.error, null);

    const notionSyncResult = await notionConnector.sync({ workspaceId: testWsId });
    console.log('notionSyncResult:', notionSyncResult);
    assert.ok(notionSyncResult.syncedCount >= 1, 'Notion sync must ingest sample pages');
    assert.equal(notionSyncResult.error, null);

    // Verify sources created in Postgres
    const sources = await query<{ connector: string; trust_boundary: string; checksum: string }>(
      `SELECT connector, trust_boundary, checksum FROM sources 
       WHERE workspace_id = $1 AND connector IN ('slack', 'notion')`,
      [testWsId]
    );
    assert.ok(sources.some((s) => s.connector === 'slack'), 'Slack source record must exist');
    assert.ok(sources.some((s) => s.connector === 'notion'), 'Notion source record must exist');
    assert.ok(sources.every((s) => s.trust_boundary === 'untrusted_content'), 'Must be untrusted_content');

    // Verify chunks exist
    const chunks = await query<{ id: string }>(
      `SELECT c.id FROM chunks c
       JOIN sources s ON s.id = c.source_id
       WHERE c.workspace_id = $1 AND s.connector IN ('slack', 'notion')`,
      [testWsId]
    );
    assert.ok(chunks.length >= 3, 'Chunks must be generated for Slack and Notion sources');

    // Verify audit logs
    const logs = await query<{ action: string }>(
      `SELECT action FROM access_logs 
       WHERE workspace_id = $1 AND (action LIKE 'slack%' OR action LIKE 'notion%')`,
      [testWsId]
    );
    assert.ok(logs.some((l) => l.action.includes('slack_sync')), 'Audit log for slack_sync must exist');
    assert.ok(logs.some((l) => l.action.includes('notion_sync')), 'Audit log for notion_sync must exist');
    console.log('✓ Verified: Ingestion, chunking, and access_logs audited successfully.');

    // =========================================================================
    // Part 6: Cross-Source Conflict Detection Across Slack, Notion, and GitHub
    // =========================================================================
    console.log('\n[Test 6] Testing Cross-Source Conflict Detection (Slack vs Notion vs GitHub)...');

    const quotes: RetrievedQuote[] = [
      {
        id: 'cite-slack-001',
        source_id: 'src-slack-01',
        source_class: 'private',
        connector: 'slack',
        quote: 'Alex Chen in #eng-deployments: Stripe webhook migration scheduled for October 15.',
      },
      {
        id: 'cite-notion-001',
        source_id: 'src-notion-01',
        source_class: 'private',
        connector: 'notion',
        quote: 'Q3 Product Spec: Merchant infrastructure migration to Stripe Connect target date is October 30.',
      },
      {
        id: 'cite-github-001',
        source_id: 'src-gh-01',
        source_class: 'private',
        connector: 'github',
        quote: 'PR #42 review discussion: Deploy freeze until November 12 for compliance verification.',
      },
    ];

    const draftBrief: DraftBrief = {
      title: 'Merchant Infrastructure Rollout Status',
      sections: {
        answer: 'The Stripe webhook migration is firmly locked in for October 15 without blockers.',
        what_i_used: {
          private: ['Slack #eng-deployments', 'Notion Q3 Product Spec', 'GitHub PR #42'],
          web: [],
          unchecked: [],
        },
        evidence: [
          {
            claim: 'The Stripe webhook rollout is scheduled for October 15.',
            citation_ids: ['cite-slack-001'],
          },
        ],
        uncertain: [],
        open_loops: ['Align on launch date across engineering, product spec, and PR review.'],
        actions: ['task: Reconcile launch dates between Slack announcement and Notion spec.'],
        what_i_did_not_do: [],
      },
    };

    const criticInput: CriticInput = {
      question: 'What is the status of the merchant infrastructure rollout?',
      mode: 'home',
      draft_brief: draftBrief,
      retrieved: quotes,
      unchecked: [],
    };

    const criticResult = evaluateCriticDeterministicForEval(criticInput);

    assert.ok(criticResult.conflicts.length > 0, 'Cross-source discrepancies must trigger conflicts');

    const hasSlackConflict = criticResult.conflicts.some((c) =>
      c.topic.toLowerCase().includes('slack') || c.topic.toLowerCase().includes('october 15')
    );
    const hasDiscrepancyTopic = criticResult.conflicts.some((c) =>
      c.topic.toLowerCase().includes('discrepancy')
    );

    assert.ok(hasSlackConflict || hasDiscrepancyTopic, 'Conflict must highlight the discrepancy across sources');
    console.log(`✓ Verified: Detected ${criticResult.conflicts.length} cross-source conflict(s):`);
    for (const c of criticResult.conflicts) {
      console.log(`  - [Conflict] ${c.topic} (Citations: ${c.citation_ids.join(', ')})`);
    }

    // =========================================================================
    // Part 7: Revocation Audit & Token Cleanup
    // =========================================================================
    console.log('\n[Test 7] Testing revocation and token purge...');
    await slackConnector.revoke(testWsId);
    await notionConnector.revoke(testWsId);

    const slackStatusAfter = await getTokenStatus(testWsId, 'slack');
    assert.equal(slackStatusAfter.connected, false, 'Slack must be disconnected after revocation');
    assert.ok(slackStatusAfter.revoked_at, 'Slack must have revoked_at timestamp');

    const notionStatusAfter = await getTokenStatus(testWsId, 'notion');
    assert.equal(notionStatusAfter.connected, false, 'Notion must be disconnected after revocation');
    assert.ok(notionStatusAfter.revoked_at, 'Notion must have revoked_at timestamp');

    const revokeLogs = await query<{ action: string }>(
      `SELECT action FROM access_logs 
       WHERE workspace_id = $1 AND action IN ('slack_revoked', 'notion_revoked')`,
      [testWsId]
    );
    assert.equal(revokeLogs.length, 2, 'Both revocations must be logged in access_logs');
    console.log('✓ Verified: Token revocation and security access_logs audit verified.');

    console.log('\n================================================================');
    console.log('  🎉 All Slack & Notion Connector Tests Passed Successfully!    ');
    console.log('================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  }
}

runPhase7TestSuite();
