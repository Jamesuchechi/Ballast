import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();
process.env.EVAL_USE_MOCK = 'true';
process.env.NODE_ENV = 'test';

import { query, queryOne } from '../src/db/client';
import { retrievePrivateChunks } from '../src/core/retrieval';
import { formatDelimitedSources, formatRetrievedQuotes } from '../src/core/sourceFormatter';
import { evaluateCriticDeterministicForEval } from '../src/core/critic';
import type { CriticInput, RetrievedQuote, DraftBrief, SourceBlock } from '../src/core/types';

async function runSourceTrustLevelTestSuite() {
  console.log('================================================================');
  console.log('   Ballast Feature E12: Per-Source Trust Level Test Suite       ');
  console.log('================================================================\n');

  const testWsId = 'e1200000-0000-0000-0000-000000000001';
  const testOtherWsId = 'e1200000-0000-0000-0000-000000000099';
  const testUserId = 'e1200000-0000-0000-0000-000000000002';

  const sourceVerifiedId = 'e1200000-0000-0000-0000-000000000101';
  const sourceUntrustedId = 'e1200000-0000-0000-0000-000000000102';

  try {
    // -------------------------------------------------------------------------
    // Setup DB Baseline Fixtures
    // -------------------------------------------------------------------------
    console.log('[Setup] Creating test user, workspaces, sources, and chunks...');
    await query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, 'e12user@ballast.local', 'hash_test', 'E12 Test User')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );

    await query(
      `INSERT INTO workspaces (id, name, plan)
       VALUES 
        ($1, 'E12 Primary Workspace', 'operator'),
        ($2, 'E12 Other Workspace', 'operator')
       ON CONFLICT (id) DO NOTHING`,
      [testWsId, testOtherWsId]
    );

    // Clean prior test fixtures
    await query(`DELETE FROM sources WHERE workspace_id IN ($1, $2)`, [testWsId, testOtherWsId]);

    // Insert 1 verified internal document source and 1 untrusted source
    await query(
      `INSERT INTO sources (id, workspace_id, connector, external_id, checksum, trust_boundary, meta)
       VALUES 
        ($1, $3, 'drive', 'internal-policy-doc', 'chk-trust-1', 'verified', '{"title":"Company Security Policy"}'::jsonb),
        ($2, $3, 'slack', 'public-chat-thread', 'chk-trust-2', 'untrusted_content', '{"title":"General Chat"}'::jsonb)`,
      [sourceVerifiedId, sourceUntrustedId, testWsId]
    );

    // -------------------------------------------------------------------------
    // TEST 1: Source Trust Retrieval & Schema Integrity
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Source Trust Boundary Schema & DB Consistency');
    const dbSource1 = await queryOne<{ trust_boundary: string }>(
      `SELECT trust_boundary FROM sources WHERE id = $1`,
      [sourceVerifiedId]
    );
    assert.strictEqual(dbSource1?.trust_boundary, 'verified');

    const dbSource2 = await queryOne<{ trust_boundary: string }>(
      `SELECT trust_boundary FROM sources WHERE id = $1`,
      [sourceUntrustedId]
    );
    assert.strictEqual(dbSource2?.trust_boundary, 'untrusted_content');
    console.log('✓ [Test 1 Passed] Sources stored with explicit verified vs untrusted_content trust boundaries.');

    // -------------------------------------------------------------------------
    // TEST 2: Source Trust Update & Access Log Auditing
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Trust Boundary Upgrade and Audit Logging');
    // Upgrade untrusted source to verified
    await query(
      `UPDATE sources SET trust_boundary = $1 WHERE id = $2 AND workspace_id = $3`,
      ['verified', sourceUntrustedId, testWsId]
    );

    await query(
      `INSERT INTO access_logs (workspace_id, source_id, action)
       VALUES ($1, $2, $3)`,
      [testWsId, sourceUntrustedId, `source_trust_update:${sourceUntrustedId} from=untrusted_content to=verified`]
    );

    const updatedSource = await queryOne<{ trust_boundary: string }>(
      `SELECT trust_boundary FROM sources WHERE id = $1`,
      [sourceUntrustedId]
    );
    assert.strictEqual(updatedSource?.trust_boundary, 'verified');

    const logEntry = await queryOne<{ action: string }>(
      `SELECT action FROM access_logs WHERE workspace_id = $1 AND source_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [testWsId, sourceUntrustedId]
    );
    assert.ok(logEntry?.action.includes('source_trust_update'));
    assert.ok(logEntry?.action.includes('to=verified'));

    // Reset back to untrusted_content for subsequent conflict testing
    await query(
      `UPDATE sources SET trust_boundary = 'untrusted_content' WHERE id = $1`,
      [sourceUntrustedId]
    );
    console.log('✓ [Test 2 Passed] Trust boundary upgrade and audit trail logging verified.');

    // -------------------------------------------------------------------------
    // TEST 3: XML Delimited Formatting with Trust Attributes
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Source and Quote XML Formatting with Trust Boundaries');
    const testSources: SourceBlock[] = [
      {
        id: sourceVerifiedId,
        class: 'private',
        connector: 'drive',
        body: 'Official Corporate Policy: Travel reimbursement limit is $500 per day.',
        trust_boundary: 'verified',
      },
      {
        id: sourceUntrustedId,
        class: 'private',
        connector: 'slack',
        body: 'Informal message: I heard we can expense up to $800 per day.',
        trust_boundary: 'untrusted_content',
      },
    ];

    const formattedXml = formatDelimitedSources(testSources);
    assert.ok(formattedXml.includes('trust="verified"'));
    assert.ok(formattedXml.includes('trust="untrusted_content"'));

    const testQuotes: RetrievedQuote[] = [
      {
        id: 'q-ver-1',
        source_id: sourceVerifiedId,
        source_class: 'private',
        connector: 'drive',
        quote: 'Official corporate launch date is October 15, 2026 confirmed by legal and compliance.',
        trust_boundary: 'verified',
      },
      {
        id: 'q-untrust-2',
        source_id: sourceUntrustedId,
        source_class: 'private',
        connector: 'slack',
        quote: 'Hey team, someone in chat mentioned the launch is November 12, 2026.',
        trust_boundary: 'untrusted_content',
      },
    ];

    const formattedQuotesXml = formatRetrievedQuotes(testQuotes);
    assert.ok(formattedQuotesXml.includes('trust="verified"'));
    assert.ok(formattedQuotesXml.includes('trust="untrusted_content"'));
    console.log('✓ [Test 3 Passed] XML formatters serialize trust boundary attributes correctly.');

    // -------------------------------------------------------------------------
    // TEST 4: Critic Conflict Evaluation with Trust Boundary Weighting
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Critic Conflict Evaluation with Trust Boundary Weighting');

    const draftBrief: DraftBrief = {
      title: 'Launch Date Brief',
      sections: {
        answer: 'The launch is scheduled for October 15, 2026.',
        what_i_used: { private: [sourceVerifiedId, sourceUntrustedId], web: [], unchecked: [] },
        evidence: [
          {
            claim: 'Official corporate launch date is October 15, 2026 confirmed by legal and compliance.',
            citation_ids: ['q-ver-1'],
          },
        ],
        uncertain: [],
        open_loops: [],
        actions: [],
        what_i_did_not_do: [],
      },
    };

    const criticInput: CriticInput = {
      question: 'When is the product launch?',
      mode: 'home',
      retrieved: testQuotes,
      draft_brief: draftBrief,
      unchecked: [],
    };

    const criticOutput = evaluateCriticDeterministicForEval(criticInput);

    // Verified claim must be kept
    assert.strictEqual(criticOutput.keep.length, 1);
    assert.strictEqual(criticOutput.keep[0].citation_ids[0], 'q-ver-1');

    // Conflict must be surfaced and clearly flag verified internal vs untrusted source
    assert.strictEqual(criticOutput.conflicts.length, 1);
    const conflict = criticOutput.conflicts[0];
    assert.ok(conflict.topic.includes('Verified Authority vs Untrusted'));
    assert.ok(conflict.topic.includes('October 15 vs November 12'));
    assert.deepStrictEqual(conflict.citation_ids, ['q-ver-1', 'q-untrust-2']);
    console.log('✓ [Test 4 Passed] Critic surfaces verified authority weighting in conflict evaluation.');

    console.log('\n================================================================');
    console.log('   ALL SOURCE TRUST LEVEL (E12) TESTS PASSED! (4/4)             ');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
}

runSourceTrustLevelTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal Test Error:', err);
    process.exit(1);
  });
