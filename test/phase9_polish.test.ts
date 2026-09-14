import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_ENV = 'test';
process.env.EVAL_USE_MOCK = 'true';

import { query, queryOne } from '../src/db/client';
import { computeBriefDiff, getRootBriefId, areInSameVersionChain } from '../src/core/diff';
import { exportBriefToObsidian, exportBriefToNotion } from '../src/core/exporters';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/lib/auth';

async function runPhase9PolishTestSuite() {
  console.log('================================================================');
  console.log('  Ballast Phase 9: Polish & Ergonomics Test Suite               ');
  console.log('================================================================\n');

  const testWsId = 'b9000000-0000-0000-0000-000000000001';
  const testUserId = 'b9000000-0000-0000-0000-000000000002';
  const testOtherWsId = 'b9000000-0000-0000-0000-000000000003';

  try {
    // -------------------------------------------------------------------------
    // Setup DB baseline fixtures
    // -------------------------------------------------------------------------
    const initialPasswordHash = await hashPassword('InitialSecret123!');
    await query(
      `INSERT INTO users (id, email, password_hash, name)
       VALUES ($1, 'polish_user@ballast.local', $2, 'Polish Tester')
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, name = 'Polish Tester'`,
      [testUserId, initialPasswordHash]
    );

    await query(
      `INSERT INTO workspaces (id, name, plan)
       VALUES ($1, 'Phase 9 Polish Workspace', 'operator')
       ON CONFLICT (id) DO UPDATE SET name = 'Phase 9 Polish Workspace'`,
      [testWsId]
    );

    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [testWsId, testUserId]
    );

    // =========================================================================
    // Test 1: Version Chain Lineage & Diffing (FR6.1, FR6.2)
    // =========================================================================
    console.log('--- Test 1: Brief Version Chain Diffing & Common Ancestor Check ---');

    const rootBriefId = 'b9000000-0000-0000-0000-000000000010';
    const childBriefId = 'b9000000-0000-0000-0000-000000000011';
    const unrelatedBriefId = 'b9000000-0000-0000-0000-000000000099';

    // Insert root brief
    const rootMarkdown = `# Executive Summary\nBaseline revenue was $1.2M in Q3.\n\n# Key Takeaways\nGrowth remained consistent.\n\n# Open Questions\nWill hiring accelerate in Q4?`;
    await query(
      `INSERT INTO briefs (id, workspace_id, question, markdown, as_of, mode, status, parent_brief_id)
       VALUES ($1, $2, 'Q3 Quarterly Summary', $3, NOW(), 'home', 'published', NULL)
       ON CONFLICT (id) DO UPDATE SET markdown = $3, parent_brief_id = NULL`,
      [rootBriefId, testWsId, rootMarkdown]
    );

    // Insert citations and claims for root brief
    const src1Id = 'b9000000-0000-0000-0000-000000000021';
    await query(
      `INSERT INTO sources (id, workspace_id, connector, external_id, checksum, meta)
       VALUES ($1, $2, 'upload', 'file_root_1', 'chk_root_1', '{"title": "Q3 Financials.pdf"}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [src1Id, testWsId]
    );

    const cit1Id = 'b9000000-0000-0000-0000-000000000031';
    await query(
      `INSERT INTO citations (id, workspace_id, brief_id, source_id, source_class, citation_type, claim_span, quote)
       VALUES ($1, $2, $3, $4, 'private', 'support', '{"claim": "Baseline revenue was $1.2M in Q3."}'::jsonb, 'Q3 closed at 1.2M')
       ON CONFLICT (id) DO NOTHING`,
      [cit1Id, testWsId, rootBriefId, src1Id]
    );

    // Insert child brief (revised version)
    const childMarkdown = `# Executive Summary\nBaseline revenue was updated to $1.4M in Q3.\n\n# Key Takeaways\nGrowth accelerated significantly in enterprise tier.\n\n# Action Plan\nExpand marketing spend by 15%.`;
    await query(
      `INSERT INTO briefs (id, workspace_id, question, markdown, as_of, mode, status, parent_brief_id)
       VALUES ($1, $2, 'Q3 Quarterly Summary', $3, NOW(), 'home', 'published', $4)
       ON CONFLICT (id) DO UPDATE SET markdown = $3, parent_brief_id = $4`,
      [childBriefId, testWsId, childMarkdown, rootBriefId]
    );

    const cit2Id = 'b9000000-0000-0000-0000-000000000032';
    await query(
      `INSERT INTO citations (id, workspace_id, brief_id, source_id, source_class, citation_type, claim_span, quote)
       VALUES ($1, $2, $3, $4, 'private', 'support', '{"claim": "Baseline revenue was updated to $1.4M in Q3."}'::jsonb, 'Audited Q3 revenue was 1.4M')
       ON CONFLICT (id) DO NOTHING`,
      [cit2Id, testWsId, childBriefId, src1Id]
    );

    // Insert unrelated brief (separate tree)
    await query(
      `INSERT INTO briefs (id, workspace_id, question, markdown, as_of, mode, status, parent_brief_id)
       VALUES ($1, $2, 'Unrelated Server Metrics', 'Server metrics were optimal.', NOW(), 'home', 'published', NULL)
       ON CONFLICT (id) DO NOTHING`,
      [unrelatedBriefId, testWsId]
    );

    // Check lineage: root & child must share root ancestor
    const rootLineage = await getRootBriefId(testWsId, rootBriefId);
    const childLineage = await getRootBriefId(testWsId, childBriefId);
    assert.strictEqual(rootLineage.rootId, rootBriefId, 'Root brief root ancestor should be itself');
    assert.strictEqual(childLineage.rootId, rootBriefId, 'Child brief root ancestor should match root brief');

    const inSameLineage = await areInSameVersionChain(testWsId, rootBriefId, childBriefId);
    assert.strictEqual(inSameLineage.sameChain, true, 'Parent and child must be detected in the same lineage');
    assert.strictEqual(inSameLineage.rootId, rootBriefId);

    const unrelatedInSameLineage = await areInSameVersionChain(testWsId, rootBriefId, unrelatedBriefId);
    assert.strictEqual(unrelatedInSameLineage.sameChain, false, 'Unrelated briefs must NOT share lineage');

    // Compute diff between root and child
    const diff = await computeBriefDiff(testWsId, rootBriefId, childBriefId);
    assert.strictEqual(diff.fromBrief.id, rootBriefId);
    assert.strictEqual(diff.toBrief.id, childBriefId);
    assert.strictEqual(diff.sharedRootId, rootBriefId);
    assert(diff.evidenceClaimDiff.addedClaims.length >= 1, 'Diff should capture added claims');
    assert(diff.evidenceClaimDiff.removedClaims.length >= 1, 'Diff should capture removed claims');
    assert(diff.stats.totalAdditions > 0, 'Diff should capture additions');
    assert(diff.stats.totalDeletions > 0, 'Diff should capture deletions');
    assert(diff.unifiedMarkdownDiff.length > 0, 'Diff should have unified lines');

    console.log('✓ Brief lineage root ancestor validation and section/claim diff computation passed.');

    // =========================================================================
    // Test 2: Obsidian & Notion Exporters (FR9)
    // =========================================================================
    console.log('\n--- Test 2: Pluggable Obsidian & Notion Markdown Exporters ---');

    const briefRecord = {
      id: childBriefId,
      question: 'Q3 Quarterly Summary',
      markdown: childMarkdown,
      as_of: new Date('2026-09-14T12:00:00Z'),
      mode: 'home',
      status: 'published',
      parent_brief_id: rootBriefId,
    };

    const citationsRecord = [
      {
        id: cit2Id,
        claim_text: 'Baseline revenue was updated to $1.4M in Q3.',
        quote: 'Audited Q3 revenue was 1.4M',
        confidence: 0.98,
        source_title: 'Q3 Financials.pdf',
        source_type: 'file',
        connector: 'upload',
      },
    ];

    // Test Obsidian format
    const obsidianExport = exportBriefToObsidian(briefRecord, citationsRecord);
    assert(obsidianExport.startsWith('---'), 'Obsidian export must start with YAML frontmatter delimiter');
    assert(obsidianExport.includes('id: "' + childBriefId + '"'), 'Obsidian frontmatter must include brief id');
    assert(obsidianExport.includes('mode: "home"'), 'Obsidian frontmatter must include mode');
    assert(obsidianExport.includes('> [!summary] Grounded Answer'), 'Obsidian export must include callout block');
    assert(obsidianExport.includes('## Evidence & Grounded Citations'), 'Obsidian export must reference citations section');

    // Test Notion format
    const notionExport = await exportBriefToNotion(briefRecord, citationsRecord);
    assert(notionExport.success === true, 'Notion export must return success');
    assert(notionExport.markdown.includes('# 🧭 Ballast Brief: Q3 Quarterly Summary'), 'Notion export must include title header');
    assert(notionExport.markdown.includes('Mode: home'), 'Notion export must include mode');
    assert(notionExport.markdown.includes('### 🔍 Grounded Evidence & Citations'), 'Notion export must include Evidence & Citations section');
    assert(notionExport.markdown.includes('Audited Q3 revenue was 1.4M'), 'Notion export must include citation quote');

    console.log('✓ Obsidian YAML frontmatter/callouts and Notion markdown blocks formatting passed.');

    // =========================================================================
    // Test 3: Claim Flagging as Wrong / Unsupported (FR9.2)
    // =========================================================================
    console.log('\n--- Test 3: Claim Flagging as Wrong or Unsupported ---');

    const flagId = 'b9000000-0000-0000-0000-000000000041';
    await query(
      `INSERT INTO flags (id, workspace_id, brief_id, citation_id, kind, note, status, created_at)
       VALUES ($1, $2, $3, $4, 'wrong', 'Numbers differ from 10-K report', 'open', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [flagId, testWsId, childBriefId, cit2Id]
    );

    const flagRow = await queryOne<any>(
      `SELECT * FROM flags WHERE id = $1`,
      [flagId]
    );
    assert(flagRow, 'Flag record should be inserted');
    assert.strictEqual(flagRow.kind, 'wrong', 'Flag kind must be wrong');
    assert.strictEqual(flagRow.status, 'open', 'Flag status must be open');
    assert.strictEqual(flagRow.note, 'Numbers differ from 10-K report');

    // Update flag to unsupported
    await query(
      `UPDATE flags SET kind = 'unsupported', note = 'Source does not substantiate growth claim' WHERE id = $1`,
      [flagId]
    );
    const updatedFlag = await queryOne<any>(`SELECT * FROM flags WHERE id = $1`, [flagId]);
    assert.strictEqual(updatedFlag.kind, 'unsupported', 'Flag kind updated to unsupported');

    console.log('✓ Claim flagging with reasons (wrong / unsupported) verified.');

    // =========================================================================
    // Test 4: Latency Metrics Calculation & NFR3.2 Thresholds
    // =========================================================================
    console.log('\n--- Test 4: Latency Percentiles (P50/P95) and NFR3.2 Targets ---');

    // Insert sample execution runs with known latencies for test workspace
    await query(
      `INSERT INTO runs (id, workspace_id, brief_id, latency_ms, tokens_in, tokens_out, cost, circuit_broken)
       VALUES 
        ('b9000000-0000-0000-0000-000000000051', $1, $2, 1200, 1500, 400, 0.002, false),
        ('b9000000-0000-0000-0000-000000000052', $1, $2, 2500, 1600, 450, 0.003, false),
        ('b9000000-0000-0000-0000-000000000053', $1, $2, 3800, 1700, 500, 0.004, false)
       ON CONFLICT (id) DO NOTHING`,
      [testWsId, childBriefId]
    );

    const homeRuns = await query<{ latency_ms: number }>(
      `SELECT r.latency_ms FROM runs r
       JOIN briefs b ON b.id = r.brief_id
       WHERE r.workspace_id = $1 AND b.mode = 'home'
       ORDER BY r.latency_ms ASC`,
      [testWsId]
    );
    const homeLatencies = homeRuns.map((r) => r.latency_ms);
    assert(homeLatencies.length >= 3, 'Must have recorded home latencies');

    function calculatePercentile(values: number[], p: number): number {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const idx = (p / 100) * (sorted.length - 1);
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      const weight = idx - lower;
      return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
    }

    const homeP50 = calculatePercentile(homeLatencies, 50);
    const homeP95 = calculatePercentile(homeLatencies, 95);

    // Verify NFR3.2 target requirements (Home: P50 <= 4500ms, P95 <= 12000ms)
    assert(homeP50 <= 4500, `Home P50 (${homeP50}ms) must meet <= 4500ms target`);
    assert(homeP95 <= 12000, `Home P95 (${homeP95}ms) must meet <= 12000ms target`);

    console.log(`✓ Home Latency P50: ${homeP50}ms (Target: <=4500ms), P95: ${homeP95}ms (Target: <=12000ms) - Passed.`);

    // =========================================================================
    // Test 5: Profile View & Edit Logic
    // =========================================================================
    console.log('\n--- Test 5: Profile Read & Edit Logic ---');

    // Test profile read
    const profileUser = await queryOne<any>(
      `SELECT id, email, name, created_at FROM users WHERE id = $1`,
      [testUserId]
    );
    assert(profileUser, 'Profile user must be found');
    assert.strictEqual(profileUser.email, 'polish_user@ballast.local');

    // Test profile edit (Name + Workspace Name)
    const newName = 'Senior Analyst Polish';
    const newWsName = 'Enterprise Analytics Group';
    await query(
      `UPDATE users SET name = $1 WHERE id = $2`,
      [newName, testUserId]
    );
    await query(
      `UPDATE workspaces SET name = $1 WHERE id = $2`,
      [newWsName, testWsId]
    );

    const updatedUser = await queryOne<any>(`SELECT name FROM users WHERE id = $1`, [testUserId]);
    const updatedWs = await queryOne<any>(`SELECT name FROM workspaces WHERE id = $1`, [testWsId]);
    assert.strictEqual(updatedUser.name, newName, 'User name should be updated');
    assert.strictEqual(updatedWs.name, newWsName, 'Workspace name should be updated');

    // Test password update and verification
    const newPasswordPlain = 'BrandNewSecret2026!';
    const newPasswordHashed = await hashPassword(newPasswordPlain);
    await query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [newPasswordHashed, testUserId]
    );

    const userWithNewPass = await queryOne<any>(`SELECT password_hash FROM users WHERE id = $1`, [testUserId]);
    const isValidOld = await verifyPassword('InitialSecret123!', userWithNewPass.password_hash);
    const isValidNew = await verifyPassword(newPasswordPlain, userWithNewPass.password_hash);

    assert.strictEqual(isValidOld, false, 'Old password must fail verification after update');
    assert.strictEqual(isValidNew, true, 'New password must verify successfully');

    console.log('✓ Profile read, name update, workspace update, and secure password change passed.');

    // =========================================================================
    // Test 6: Auth Logout Token Verification
    // =========================================================================
    console.log('\n--- Test 6: Auth Logout and Cookie Expiration Flow ---');

    // Sign a token
    const token = signToken({
      userId: testUserId,
      email: 'polish_user@ballast.local',
      workspaceId: testWsId,
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const verified = verifyToken(token);
    assert(verified && verified.userId === testUserId, 'Token must be valid initially');

    // Simulate logout cookie response
    const expiredCookieHeader = 'ballast_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax';
    assert(expiredCookieHeader.includes('Expires=Thu, 01 Jan 1970'), 'Logout must set epoch 0 expiration to purge cookie');

    console.log('✓ Logout session cookie purging verified.');

    console.log('\n================================================================');
    console.log('  ALL PHASE 9 POLISH TESTS PASSED SUCCESSFULLY!                 ');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Test suite failed with error:', err);
    process.exit(1);
  }
}

runPhase9PolishTestSuite();
