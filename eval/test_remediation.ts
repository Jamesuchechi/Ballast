import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pool, query, queryOne } from '../src/db/client.js';
import { signToken, getAuthSession } from '../src/lib/auth.js';
import { generateSimplePdf } from '../src/core/pdfRenderer.js';
import { retrievePrivateChunks } from '../src/core/retrieval.js';
import { chunkAndEmbedText } from '../src/core/embeddings.js';
import { processQueuedBrief } from '../src/core/pipelineWorker.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runRemediationTests() {
  console.log('\n=== BALLAST AUDIT REMEDIATION VERIFICATION SUITE ===\n');

  const wsId = randomUUID();
  const userId = randomUUID();

  // Setup test tenancy
  await query(`INSERT INTO workspaces (id, name, plan) VALUES ($1, 'Remediation Test WS', 'pro')`, [wsId]);
  await query(
    `INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, 'dummy:hash', 'Test Tester')`,
    [userId, `remediation_${Date.now()}@ballast.test`]
  );
  await query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [wsId, userId]);

  try {
    // -------------------------------------------------------------
    // Test 1: Multi-Tenant Session Cookie Parsing Security
    // -------------------------------------------------------------
    console.log('1. Multi-Tenant Session Parsing & Signature Verification:');
    
    // (a) Valid signed token
    const validToken = signToken({
      userId,
      workspaceId: wsId,
      email: 'tester@ballast.test',
      role: 'owner',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const validReq = {
      cookies: {
        get: (name: string) => (name === 'ballast_session' ? { value: validToken } : undefined),
      },
    };

    const sessionA = await getAuthSession(validReq);
    assert(sessionA !== null && sessionA.userId === userId, 'Valid HMAC-signed cookie resolves correct user');
    assert(sessionA?.workspaceId === wsId, 'Resolved session matches correct workspace ID');

    // (b) Raw UUID cookie attack / bug (Must NOT be treated as user ID)
    const rawUuidReq = {
      cookies: {
        get: (name: string) => (name === 'ballast_session' ? { value: userId } : undefined),
      },
    };

    const sessionB = await getAuthSession(rawUuidReq);
    assert(sessionB === null, 'Raw unsigned UUID cookie safely rejected without signature');

    // (c) Tampered signature
    const tamperedReq = {
      cookies: {
        get: (name: string) => (name === 'ballast_session' ? { value: `${validToken}evil` } : undefined),
      },
    };
    const sessionC = await getAuthSession(tamperedReq);
    assert(sessionC === null, 'Tampered token signature safely rejected');

    // -------------------------------------------------------------
    // Test 2: Multi-Page PDF Generation (No Truncation of What I did not do)
    // -------------------------------------------------------------
    console.log('\n2. Multi-Page PDF Generation & Section Completeness:');
    const longLines: string[] = [
      '# Detailed Ballast Engineering Brief',
      'As of: 2026-09-13T00:00:00.000Z',
      'Mode: home',
      'Status: published',
      '',
      '## Answer',
    ];
    for (let i = 1; i <= 10; i++) {
      longLines.push(`- Key milestone ${i}: Staging deployment completed and verified against regression suites.`);
    }
    longLines.push('');
    longLines.push('## What I used');
    longLines.push('### Private');
    longLines.push('- doc_staging_log.txt');
    longLines.push('### Web');
    longLines.push('- None');
    longLines.push('### Could not be checked');
    longLines.push('- None');
    longLines.push('');
    longLines.push('## Evidence');
    for (let i = 1; i <= 15; i++) {
      longLines.push(`- Claim: Integration service ${i} passed end-to-end integration tests.`);
      longLines.push(`  - [private] src_${i} — “Integration test suite ${i} verified zero failures.”`);
    }
    longLines.push('');
    longLines.push('## Uncertain / missing');
    longLines.push('- External vendor API status remains unconfirmed until Monday.');
    longLines.push('');
    longLines.push('## Open loops');
    longLines.push('- Confirm cloud billing ceiling before load test.');
    longLines.push('');
    longLines.push('## Actions');
    longLines.push('- [ ] Send staging validation report to team.');
    longLines.push('');
    longLines.push('## What I did not do');
    longLines.push('- Did not enable production auto-debit.');
    longLines.push('- No unverified claims published.');

    const pdfBuffer = generateSimplePdf('Detailed Ballast Engineering Brief', longLines);
    const pdfString = pdfBuffer.toString('binary');

    assert(pdfBuffer.length > 0, `Generated PDF buffer (${pdfBuffer.length} bytes)`);
    assert(pdfString.startsWith('%PDF-1.4'), 'PDF header matches valid PDF-1.4');
    assert(pdfString.includes('/Count 2') || pdfString.includes('/Count 3'), 'Multi-page catalog contains >1 page (/Count >= 2)');
    assert(pdfString.includes('What I did not do'), 'Mandatory "What I did not do" section rendered in multi-page PDF output');

    // -------------------------------------------------------------
    // Test 3: Authentic Connector Tagging in Retrieval
    // -------------------------------------------------------------
    console.log('\n3. Authentic Connector Propagation in Retrieval Engine:');
    const gmailSourceId = randomUUID();
    await query(
      `INSERT INTO sources (id, workspace_id, connector, external_id, checksum, trust_boundary)
       VALUES ($1, $2, 'gmail', 'thread_gmail_123', 'checksum_gmail_123', 'untrusted_content')`,
      [gmailSourceId, wsId]
    );

    await chunkAndEmbedText({
      workspaceId: wsId,
      sourceId: gmailSourceId,
      text: 'Alex approved the staging webhook handler migration plan for Gmail sync.',
    });

    const retrievalResult = await retrievePrivateChunks({
      workspaceId: wsId,
      queryText: 'staging webhook handler migration plan',
      limit: 3,
    });

    const gmailQuote = retrievalResult.quotes.find((q) => q.source_id === gmailSourceId);
    assert(Boolean(gmailQuote), 'Retrieved quote from Gmail source');
    assert(gmailQuote?.connector === 'gmail', `Quote connector is authentic 'gmail' (got: '${gmailQuote?.connector}')`);

    const gmailSourceBlock = retrievalResult.sources.find((s) => s.id === gmailSourceId);
    assert(gmailSourceBlock?.connector === 'gmail', `SourceBlock connector is authentic 'gmail'`);

    // -------------------------------------------------------------
    // Test 4: Access Logging for All Distinct Retrieved Sources
    // -------------------------------------------------------------
    console.log('\n4. Multi-Source Access Logging:');
    const uploadSourceId = randomUUID();
    await query(
      `INSERT INTO sources (id, workspace_id, connector, external_id, checksum, trust_boundary)
       VALUES ($1, $2, 'upload', 'architecture_notes.txt', 'checksum_upload_456', 'untrusted_content')`,
      [uploadSourceId, wsId]
    );

    await chunkAndEmbedText({
      workspaceId: wsId,
      sourceId: uploadSourceId,
      text: 'Elena confirmed compliance sign-off requirements for staging webhook handler.',
    });

    // Clear previous logs for clean test count
    await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [wsId]);

    await retrievePrivateChunks({
      workspaceId: wsId,
      queryText: 'staging webhook handler compliance',
      limit: 5,
    });

    const accessLogRows = await query<{ source_id: string }>(
      `SELECT source_id FROM access_logs WHERE workspace_id = $1`,
      [wsId]
    );
    const loggedSourceIds = accessLogRows.map((r) => r.source_id);

    assert(loggedSourceIds.includes(gmailSourceId), 'Recorded access_logs entry for Gmail source');
    assert(loggedSourceIds.includes(uploadSourceId), 'Recorded access_logs entry for Upload source');

    // -------------------------------------------------------------
    // Test 5: Pipeline Worker Answer Grounding & Conflict Citations
    // -------------------------------------------------------------
    console.log('\n5. Pipeline Worker Answer Grounding & Conflict Citations:');
    const testBriefId = randomUUID();
    await query(
      `INSERT INTO briefs (id, workspace_id, question, mode, status, progress)
       VALUES ($1, $2, 'What are the deployment updates for webhook handler?', 'home', 'queued', '[]'::jsonb)`,
      [testBriefId, wsId]
    );

    const publishedBrief = await processQueuedBrief(testBriefId);
    assert(publishedBrief !== null && publishedBrief.status === 'published', 'Brief published successfully');

    // Answer lines must start with bullet and quote keep claims
    const answerLines = (publishedBrief?.sections.answer || '').split('\n').filter(Boolean);
    assert(answerLines.length > 0, `Published Answer contains ${answerLines.length} lines`);
    assert(answerLines.every((l) => l.startsWith('- ')), 'Every Answer line is a bullet derived from verified keep claims');

    // Check conflict citations persistence capability
    // Plant two conflicting quotes across sources
    const conflictSourceA = randomUUID();
    const conflictSourceB = randomUUID();
    await query(
      `INSERT INTO sources (id, workspace_id, connector, external_id, checksum, trust_boundary)
       VALUES ($1, $2, 'upload', 'memo_a.txt', 'chk_a', 'untrusted_content'),
              ($3, $2, 'upload', 'memo_b.txt', 'chk_b', 'untrusted_content')`,
      [conflictSourceA, wsId, conflictSourceB]
    );

    await chunkAndEmbedText({
      workspaceId: wsId,
      sourceId: conflictSourceA,
      text: 'Launch date is scheduled for October 15 with billing enabled.',
    });
    await chunkAndEmbedText({
      workspaceId: wsId,
      sourceId: conflictSourceB,
      text: 'Launch date is scheduled for November 12 due to security audits.',
    });

    const conflictBriefId = randomUUID();
    await query(
      `INSERT INTO briefs (id, workspace_id, question, mode, status, progress)
       VALUES ($1, $2, 'What is the launch date?', 'home', 'queued', '[]'::jsonb)`,
      [conflictBriefId, wsId]
    );

    const conflictBriefRes = await processQueuedBrief(conflictBriefId);
    assert(conflictBriefRes?.status === 'published', 'Conflict brief published');

    const conflictCitations = await query<{ citation_type: string; quote: string }>(
      `SELECT citation_type, quote FROM citations WHERE brief_id = $1 AND citation_type = 'conflict'`,
      [conflictBriefId]
    );
    assert(conflictCitations.length >= 2, `Persisted ${conflictCitations.length} citations with citation_type='conflict'`);
    assert(
      Boolean(conflictBriefRes?.sections.uncertain.some((u) => u.toLowerCase().includes('conflict'))),
      'Surfaced conflict description inside Uncertain / missing section'
    );

  } finally {
    // Cleanup test workspace and user
    await query(`DELETE FROM workspaces WHERE id = $1`, [wsId]);
    await query(`DELETE FROM users WHERE id = $1`, [userId]);
  }

  console.log('\n==========================================');
  console.log(`Remediation Tests Passed: ${passed} | Tests Failed: ${failed}`);
  console.log('==========================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runRemediationTests().catch(async (err) => {
  console.error('Unhandled remediation test error:', err);
  await pool.end();
  process.exit(1);
});
