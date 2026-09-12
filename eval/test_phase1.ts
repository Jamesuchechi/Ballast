import 'dotenv/config';
import crypto from 'crypto';
import { pool, query, queryOne } from '../src/db/client.js';
import { createUserWithWorkspace, authenticateUser } from '../src/lib/auth.js';
import { seedCanonicalBrief } from '../src/core/briefSeed.js';
import { validateForPublish } from '../src/core/validator.js';
import { runWatchdog } from '../src/core/watchdog.js';
import { objectStore } from '../src/storage/objectStore.js';
import type { PublishedBriefSections, PublishedEvidenceItem } from '../src/core/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=== BALLAST PHASE 1 VERIFICATION SUITE ===\n');

  // Test 1: Database Tables Verification
  console.log('1. Database Tables & Schema:');
  const tableRows = await query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  const tables = tableRows.map((r) => r.table_name);
  const requiredTables = [
    'users', 'workspaces', 'workspace_members', 'sources', 'chunks',
    'briefs', 'citations', 'actions', 'runs', 'schedules',
    'flags', 'access_logs', 'oauth_tokens'
  ];

  for (const t of requiredTables) {
    assert(tables.includes(t), `Table "${t}" exists in PostgreSQL`);
  }

  // Test 2: Tenancy & Auth
  console.log('\n2. Tenancy & Auth:');
  const testEmail = `test_${Date.now()}@ballast.local`;
  const { user, workspace, token } = await createUserWithWorkspace({
    email: testEmail,
    password: 'password123',
    name: 'Ada Lovelace',
    workspaceName: "Ada's Research Lab",
  });

  assert(!!user.id, `User created with id: ${user.id}`);
  assert(!!workspace.id, `Workspace created with id: ${workspace.id}`);

  // Check workspace_members role is owner
  const member = await queryOne(
    `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspace.id, user.id]
  );
  assert(member?.role === 'owner', `Workspace creator has role='owner'`);

  // Test authenticateUser
  const authRes = await authenticateUser(testEmail, 'password123');
  assert(!!authRes && authRes.user.id === user.id, `Password verification and login succeed`);

  const failAuth = await authenticateUser(testEmail, 'wrongpassword');
  assert(failAuth === null, `Invalid password rejected`);

  // Test 3: Brief Seed, Markdown, PDF, and Citations
  console.log('\n3. Canonical Brief Seed & Artifacts:');
  const seed = await seedCanonicalBrief(workspace.id);
  assert(!!seed.briefId, `Seed brief inserted with id: ${seed.briefId}`);
  assert(seed.markdown.includes('## What I did not do'), `Markdown includes mandatory "## What I did not do"`);
  assert(seed.markdown.includes('## Answer'), `Markdown includes "## Answer"`);
  assert(seed.markdown.includes('## Evidence'), `Markdown includes "## Evidence"`);

  // Check PDF in object storage
  const pdfBuffer = await objectStore.get(seed.pdfUri);
  assert(pdfBuffer !== null && pdfBuffer.length > 0, `PDF artifact generated and readable from object store (${pdfBuffer?.length} bytes)`);
  assert(Boolean(pdfBuffer && pdfBuffer.toString('ascii', 0, 8).startsWith('%PDF-1.')), `PDF header matches valid PDF-1.x specification`);

  // Check Citations in DB
  const citations = await query(
    `SELECT id, source_class, citation_type, quote, claim_span FROM citations WHERE brief_id = $1`,
    [seed.briefId]
  );
  assert(citations.length > 0, `Stored ${citations.length} grounded citation rows in DB`);
  assert(citations.every((c) => c.citation_type === 'support'), `All seed citations are type='support'`);

  // Test 4: Publish Validator Rejection Gate
  console.log('\n4. Publish Validator Gate:');
  const sectionsWithoutSupport: PublishedBriefSections = {
    answer: 'Some unsubstantiated answer claim.',
    what_i_used: { private: ['doc1'], web: [], unchecked: [] },
    evidence: [
      {
        claim: 'Unfounded claim with no support citation.',
        citations: [], // EMPTY CITATIONS!
      },
    ],
    uncertain: [],
    open_loops: [],
    actions: [],
    what_i_did_not_do: ['Did not do X'],
  };

  const invalidPublish = validateForPublish({
    markdown: `## Answer\nSome answer\n\n## What I used\n### Private\n- doc1\n### Web\n- None\n### Could not be checked\n- None\n\n## Evidence\n- Claim: Unfounded claim with no support citation.\n\n## Uncertain / missing\n- None\n\n## Open loops\n- None\n\n## Actions\n- None\n\n## What I did not do\n- Did not do X`,
    mode: 'home',
    criticOutput: {
      keep: [{ claim: 'Unfounded claim with no support citation.', citation_ids: [] }],
      drop: [],
      conflicts: [],
      missing: [],
      did_not: ['Did not do X'],
    },
    evidence: sectionsWithoutSupport.evidence,
    unchecked: [],
    sections: sectionsWithoutSupport,
  });

  assert(!invalidPublish.valid, `Validator rejected brief lacking support citation`);
  assert(invalidPublish.status === 'failed', `Validator returned status='failed'`);

  // Test 5: Regeneration Version Chain (Child row with parent_brief_id)
  console.log('\n5. Regeneration Version Chain:');
  const originalBrief = await queryOne(
    `SELECT id, question, mode, markdown FROM briefs WHERE id = $1`,
    [seed.briefId]
  );

  const childId = crypto.randomUUID();
  await query(
    `INSERT INTO briefs (id, workspace_id, parent_brief_id, question, mode, status, markdown, template_version)
     VALUES ($1, $2, $3, $4, $5, 'published', $6, 'v1')`,
    [childId, workspace.id, originalBrief.id, originalBrief.question, originalBrief.mode, 'Regenerated content']
  );

  const freshOriginal = await queryOne(`SELECT markdown FROM briefs WHERE id = $1`, [seed.briefId]);
  const childRow = await queryOne(`SELECT id, parent_brief_id FROM briefs WHERE id = $1`, [childId]);

  assert(freshOriginal.markdown === originalBrief.markdown, `Original brief row markdown remains unchanged`);
  assert(childRow.parent_brief_id === originalBrief.id, `Child row has parent_brief_id pointing to original brief`);

  // Test 6: Watchdog Stub
  console.log('\n6. Watchdog Stub:');
  const timedOutId = crypto.randomUUID();
  const pastTime = new Date(Date.now() - 120 * 1000).toISOString(); // 2 mins ago
  await query(
    `INSERT INTO briefs (id, workspace_id, question, status, as_of)
     VALUES ($1, $2, 'Timed out test brief', 'running', $3)`,
    [timedOutId, workspace.id, pastTime]
  );

  const watchdogResult = await runWatchdog(60); // 60s cutoff
  const updatedTimedOut = await queryOne<{ status: string; error: string }>(
    `SELECT status, error FROM briefs WHERE id = $1`,
    [timedOutId]
  );

  assert(watchdogResult.interruptedBriefIds.includes(timedOutId), `Watchdog identified timed-out running brief`);
  assert(updatedTimedOut?.status === 'failed', `Timed-out brief updated to status='failed'`);
  assert(updatedTimedOut?.error === 'generation interrupted', `Timed-out brief error is 'generation interrupted'`);

  console.log(`\n==========================================`);
  console.log(`Tests Passed: ${passed} | Tests Failed: ${failed}`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test runner fatal error:', err);
    pool.end();
    process.exit(1);
  });
