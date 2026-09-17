import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();
process.env.EVAL_USE_MOCK = 'true';
process.env.NODE_ENV = 'test';

import { query, queryOne } from '../src/db/client';
import { resolveConflictCitation, getWorkspaceConflictMemory, getBriefConflicts } from '../src/core/conflictResolver';
import { runCritic, evaluateCriticDeterministicForEval } from '../src/core/critic';
import { runWriter, generateDeterministicDraftForEval } from '../src/core/writer';
import type { CriticInput, RetrievedQuote, DraftBrief } from '../src/core/types';

async function runConflictResolutionTestSuite() {
  console.log('================================================================');
  console.log('  Ballast Feature E9: Conflict Resolution Workflow Test Suite    ');
  console.log('================================================================\n');

  const testWsId = 'e9000000-0000-0000-0000-000000000001';
  const testOtherWsId = 'e9000000-0000-0000-0000-000000000099';
  const testBriefId = 'e9000000-0000-0000-0000-000000000002';
  const testUserId = 'e9000000-0000-0000-0000-000000000003';

  const citGmailId = 'e9000000-0000-0000-0000-000000000101';
  const citGitHubId = 'e9000000-0000-0000-0000-000000000202';
  const sourceGmailId = 'e9000000-0000-0000-0000-000000000301';
  const sourceGitHubId = 'e9000000-0000-0000-0000-000000000302';

  try {
    // -------------------------------------------------------------------------
    // Setup DB Baseline Fixtures
    // -------------------------------------------------------------------------
    console.log('[Setup] Creating test users, workspaces, briefs, and citations...');
    await query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, 'e9user@ballast.local', 'hash_test', 'E9 Test User')
       ON CONFLICT (id) DO NOTHING`,
      [testUserId]
    );

    await query(
      `INSERT INTO workspaces (id, name, plan)
       VALUES 
        ($1, 'E9 Primary Workspace', 'operator'),
        ($2, 'E9 Other Workspace', 'operator')
       ON CONFLICT (id) DO NOTHING`,
      [testWsId, testOtherWsId]
    );

    await query(
      `INSERT INTO briefs (id, workspace_id, question, status, markdown)
       VALUES ($1, $2, 'When is the mobile launch milestone scheduled?', 'published', '# Mobile Launch')
       ON CONFLICT (id) DO NOTHING`,
      [testBriefId, testWsId]
    );

    await query(
      `INSERT INTO sources (id, workspace_id, connector, external_id, checksum)
       VALUES 
        ($1, $3, 'gmail', 'thread-e9-1', 'chk-g-1'),
        ($2, $3, 'github', 'repo#99', 'chk-gh-2')
       ON CONFLICT (id) DO NOTHING`,
      [sourceGmailId, sourceGitHubId, testWsId]
    );

    await query(
      `INSERT INTO citations (
        id, workspace_id, brief_id, source_id, source_class, citation_type, claim_span, quote, resolution_status
       ) VALUES 
        ($1, $3, $4, $5, 'private', 'conflict', '{"start":0,"end":0}', 'Email confirmed launch is fixed for November 12.', 'unresolved'),
        ($2, $3, $4, $6, 'private', 'conflict', '{"start":0,"end":0}', 'GitHub milestone says launch is postponed to December 5.', 'unresolved')
       ON CONFLICT (id) DO UPDATE SET resolution_status = 'unresolved'`,
      [citGmailId, citGitHubId, testWsId, testBriefId, sourceGmailId, sourceGitHubId]
    );

    console.log('✓ Fixtures initialized.\n');

    // -------------------------------------------------------------------------
    // Test 1: Resolve Conflict Citation (Mark Confirmed Accurate)
    // -------------------------------------------------------------------------
    console.log('[Test 1] Resolving conflict citation as "confirmed_accurate"...');
    const resResult = await resolveConflictCitation({
      workspaceId: testWsId,
      citationId: citGmailId,
      resolutionType: 'confirmed_accurate',
      userNote: 'Confirmed via executive sync that email date (November 12) is the true target.',
      userId: testUserId,
      topic: 'Discrepancy regarding date/milestone (November 12 vs December 5)',
    });

    assert.equal(resResult.success, true);
    assert.equal(resResult.citation.resolution_status, 'confirmed_accurate');
    assert.ok(resResult.resolutionId);

    // Verify DB record in citations table
    const citDb = await queryOne<any>(`SELECT * FROM citations WHERE id = $1`, [citGmailId]);
    assert.equal(citDb.resolution_status, 'confirmed_accurate');
    assert.ok(citDb.resolved_at);
    assert.equal(citDb.resolved_by, testUserId);
    assert.ok(citDb.resolution_note.includes('November 12'));

    // Verify DB record in conflict_resolutions table
    const crDb = await queryOne<any>(`SELECT * FROM conflict_resolutions WHERE id = $1`, [resResult.resolutionId]);
    assert.equal(crDb.workspace_id, testWsId);
    assert.equal(crDb.citation_id, citGmailId);
    assert.equal(crDb.resolution_type, 'confirmed_accurate');
    assert.equal(crDb.resolved_by, testUserId);

    // Verify access_logs entry
    const logDb = await queryOne<any>(
      `SELECT * FROM access_logs WHERE workspace_id = $1 AND action = 'conflict_resolved:confirmed_accurate' ORDER BY created_at DESC LIMIT 1`,
      [testWsId]
    );
    assert.ok(logDb);
    console.log('✓ Verified: Conflict citation updated with persistent audit record in conflict_resolutions and access_logs.');

    // -------------------------------------------------------------------------
    // Test 2: Cross-Workspace Security Isolation
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Verifying tenant isolation (rejecting cross-workspace citation resolution)...');
    await assert.rejects(
      async () => {
        await resolveConflictCitation({
          workspaceId: testOtherWsId, // Different workspace
          citationId: citGmailId,
          resolutionType: 'confirmed_accurate',
        });
      },
      /not found or does not belong to workspace/i
    );
    console.log('✓ Verified: Cross-workspace citation resolution is strictly prohibited.');

    // -------------------------------------------------------------------------
    // Test 3: Workspace Conflict Memory Retrieval
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Testing getWorkspaceConflictMemory...');
    const memory = await getWorkspaceConflictMemory(testWsId);
    assert.ok(memory.length > 0);
    const memEntry = memory.find((m) => m.citation_id === citGmailId);
    assert.ok(memEntry);
    assert.equal(memEntry.resolution_type, 'confirmed_accurate');
    assert.equal(memEntry.connector, 'gmail');
    console.log('✓ Verified: Workspace conflict memory correctly loaded with citation and connector context.');

    // -------------------------------------------------------------------------
    // Test 4: Feeding Conflict Memory Back Into Critic
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Verifying Critic recognizes resolved conflict memory...');
    const quote1: RetrievedQuote = {
      id: 'q1',
      source_id: sourceGmailId,
      source_class: 'private',
      connector: 'gmail',
      quote: 'Email confirmed launch is fixed for November 12.',
    };
    const quote2: RetrievedQuote = {
      id: 'q2',
      source_id: sourceGitHubId,
      source_class: 'private',
      connector: 'github',
      quote: 'GitHub milestone says launch is postponed to December 5.',
    };

    const draftSample: DraftBrief = {
      title: 'Brief: Mobile Launch',
      sections: {
        summary: 'Launch is set for November 12.',
        answer: 'Launch is set for November 12.',
        what_i_used: { private: [sourceGmailId], web: [], unchecked: [] },
        evidence: [{ claim: 'Launch is set for November 12.', citation_ids: ['q1'] }],
        uncertain: [],
        open_loops: [],
        actions: [],
        what_i_did_not_do: [],
      },
    };

    // Run critic WITHOUT resolved conflicts: should detect discrepancy
    const criticOutUnresolved = evaluateCriticDeterministicForEval({
      question: 'When is the mobile launch milestone scheduled?',
      mode: 'home',
      retrieved: [quote1, quote2],
      draft_brief: draftSample,
      unchecked: [],
    });
    assert.ok(criticOutUnresolved.conflicts.length >= 1, 'Critic without memory must detect conflict');

    // Run critic WITH resolved conflict memory: should recognize user resolution
    const criticOutResolved = evaluateCriticDeterministicForEval({
      question: 'When is the mobile launch milestone scheduled?',
      mode: 'home',
      retrieved: [quote1, quote2],
      draft_brief: draftSample,
      unchecked: [],
      resolved_conflicts: memory,
    });
    assert.equal(criticOutResolved.conflicts.length, 0, 'Critic with memory must NOT re-flag resolved conflict');
    console.log('✓ Verified: Critic honors user-confirmed conflict resolution and skips duplicate unresolvable conflict flag.');

    // -------------------------------------------------------------------------
    // Test 5: Writer Incorporating Resolved Conflict Memory
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Verifying Writer incorporates resolved conflict memory...');
    const draftFromWriter = await runWriter({
      question: 'When is the mobile launch milestone scheduled?',
      mode: 'home',
      sources: [
        { id: sourceGmailId, class: 'private', connector: 'gmail', body: 'Email launch info' },
        { id: sourceGitHubId, class: 'private', connector: 'github', body: 'GitHub milestone info' },
      ],
      retrieved: [quote1, quote2],
      resolvedConflicts: memory,
    });
    assert.ok(draftFromWriter.title);
    assert.ok(draftFromWriter.sections.answer);
    console.log('✓ Verified: Writer runs smoothly with resolved conflict memory options.');

    // -------------------------------------------------------------------------
    // Test 6: Brief Conflicts API Helper
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Testing getBriefConflicts...');
    const briefConflicts = await getBriefConflicts(testBriefId, testWsId);
    assert.equal(briefConflicts.length, 2);
    const confirmedCit = briefConflicts.find((c) => c.id === citGmailId);
    assert.equal(confirmedCit?.resolution_status, 'confirmed_accurate');
    console.log('✓ Verified: getBriefConflicts returned all brief conflicts with updated resolution status.');

    console.log('\n================================================================');
    console.log('  All E9 Conflict Resolution Workflow Tests Passed (6/6)!      ');
    console.log('================================================================\n');
  } catch (err: any) {
    console.error('\n❌ Test Suite Failed:', err);
    throw err;
  }
}

runConflictResolutionTestSuite()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
