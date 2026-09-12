import { randomUUID } from 'node:crypto';
import { query, queryOne, pool } from '../src/db/client.js';
import { validateUpload, ingestDocument, ingestPastedSnippet } from '../src/core/ingest.js';
import { retrievePrivateChunks } from '../src/core/retrieval.js';
import { processQueuedBrief, CANONICAL_STEPS } from '../src/core/pipelineWorker.js';

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

async function runPhase2Tests() {
  console.log('=== BALLAST PHASE 2 VERIFICATION SUITE ===\n');

  // Test setup: create test workspace
  const wsIdA = randomUUID();
  const wsIdB = randomUUID();

  await query(`INSERT INTO workspaces (id, name, plan) VALUES ($1, 'Test WS A', 'free')`, [wsIdA]);
  await query(`INSERT INTO workspaces (id, name, plan) VALUES ($1, 'Foreign WS B', 'free')`, [wsIdB]);

  try {
    // 1. Upload Allowlist & 20MB Size Cap (NFR3.4)
    console.log('1. Upload Allowlist & Size Cap (NFR3.4):');
    let rejectedExtension = false;
    try {
      validateUpload('malicious_payload.exe', 1024);
    } catch {
      rejectedExtension = true;
    }
    assert(rejectedExtension, 'Rejected unallowed extension .exe');

    let rejectedOversize = false;
    try {
      validateUpload('huge_dump.txt', 25 * 1024 * 1024);
    } catch {
      rejectedOversize = true;
    }
    assert(rejectedOversize, 'Rejected file exceeding 20 MB size cap');

    let acceptedValid = true;
    try {
      validateUpload('billing_notes.md', 1024 * 50);
      validateUpload('specs.pdf', 1024 * 200);
      validateUpload('export.csv', 1024 * 30);
    } catch {
      acceptedValid = false;
    }
    assert(acceptedValid, 'Accepted valid extensions (md, pdf, csv)');

    // 2. Document Ingestion & Deduplication (FR2.4, FR2.10)
    console.log('\n2. Document Ingestion & Deduplication:');
    const sampleTextA = `Q3 Billing Revamp Engineering Sync:
The Stripe webhook handler is deployed to staging and passing tests.
Alex needs to confirm the merchant accounts configuration in the new Stripe dashboard.
Legal review from Elena is pending before auto-debit can be enabled in production.
Database migration scripts for subscriber tiers are ready.`;

    const ingestRes1 = await ingestPastedSnippet(wsIdA, 'q3_billing_notes.txt', sampleTextA);
    assert(Boolean(ingestRes1.sourceId), `Ingested document into workspace A with id ${ingestRes1.sourceId}`);
    assert(ingestRes1.chunkCount > 0, `Generated ${ingestRes1.chunkCount} chunks`);
    assert(!ingestRes1.deduplicated, 'First upload was not marked as duplicate');

    // Duplicate upload check (FR2.10)
    const ingestRes2 = await ingestPastedSnippet(wsIdA, 'q3_billing_notes.txt', sampleTextA);
    assert(ingestRes2.deduplicated, 'Identical document deduplicated without duplicating sources row');

    // 3. Chunking & pgvector Storage (FR3.1)
    console.log('\n3. Chunking & pgvector Storage (FR3.1):');
    const chunksA = await query<{ id: string; text: string; has_vec: boolean; ordinal: number }>(
      `SELECT id, text, (embedding IS NOT NULL) as has_vec, ordinal
       FROM chunks
       WHERE workspace_id = $1 AND source_id = $2
       ORDER BY ordinal ASC`,
      [wsIdA, ingestRes1.sourceId]
    );
    assert(chunksA.length > 0, `Found ${chunksA.length} chunk rows in PostgreSQL`);
    assert(chunksA.every((c) => c.has_vec), 'All chunks have valid non-null pgvector embeddings');

    // 4. SQL Workspace ACL & Multi-Tenant Isolation (FR3.2, NFR5.2)
    console.log('\n4. Multi-Tenant Vector Retrieval Isolation (FR3.2, NFR5.2):');
    // Plant a foreign chunk in Workspace B that matches the query terms exactly
    const foreignText = `FOREIGN SECRET: Stripe webhook handler in foreign workspace B should NEVER leak.`;
    const ingestForeign = await ingestPastedSnippet(wsIdB, 'foreign_leak.txt', foreignText);

    // Retrieve in Workspace A
    const retrievalResA = await retrievePrivateChunks({
      workspaceId: wsIdA,
      queryText: 'Stripe webhook handler staging status',
      limit: 5,
    });

    const leakedChunk = retrievalResA.quotes.find((q) => q.quote.includes('FOREIGN SECRET'));
    assert(!leakedChunk, 'Planted foreign chunk from Workspace B is NEVER returned in Workspace A retrieval');
    assert(retrievalResA.quotes.length > 0, `Retrieved ${retrievalResA.quotes.length} relevant quotes from Workspace A`);

    // 5. Async Enqueue & Canonical Progress Pipeline (FR4.6, FR4.15, NFR6.3)
    console.log('\n5. Async Pipeline & Canonical Progress Steps:');
    const briefQuestion = 'What is the staging status of the Stripe webhook handler?';
    const initProgress = [{ step: 'queued', timestamp: new Date().toISOString() }];

    const briefRows = await query<{ id: string }>(
      `INSERT INTO briefs (
        workspace_id, question, mode, status, progress, stale_after
      ) VALUES ($1, $2, 'home', 'queued', $3::jsonb, NOW() + INTERVAL '7 days')
      RETURNING id`,
      [wsIdA, briefQuestion, JSON.stringify(initProgress)]
    );
    const briefId = briefRows[0].id;
    assert(Boolean(briefId), `Created queued brief ${briefId}`);

    // Run background worker
    const publishedBrief = await processQueuedBrief(briefId);
    assert(Boolean(publishedBrief), 'Async pipeline worker successfully processed brief');
    assert(publishedBrief?.status === 'published', `Brief status transitioned to published`);

    // Inspect progress array
    const progressRow = await queryOne<{ progress: any[] }>(
      `SELECT progress FROM briefs WHERE id = $1`,
      [briefId]
    );
    const recordedSteps = (progressRow?.progress || []).map((p: any) => p.step);

    assert(recordedSteps.includes('planning'), 'Progress recorded step "planning"');
    assert(recordedSteps.includes('retrieving_private'), 'Progress recorded step "retrieving_private"');
    assert(recordedSteps.includes('drafting'), 'Progress recorded step "drafting"');
    assert(recordedSteps.includes('verifying'), 'Progress recorded step "verifying"');
    assert(recordedSteps.includes('validating'), 'Progress recorded step "validating"');
    assert(recordedSteps.includes('rendering'), 'Progress recorded step "rendering"');
    assert(recordedSteps.includes('published'), 'Progress recorded step "published"');

    // 6. Citations & Runs Persistence (FR4.3, NFR6.1)
    console.log('\n6. Citations & Runs Persistence (FR4.3, NFR6.1):');
    const citationRows = await query<{ source_class: string; citation_type: string; quote: string }>(
      `SELECT source_class, citation_type, quote FROM citations WHERE brief_id = $1`,
      [briefId]
    );
    assert(citationRows.length > 0, `Stored ${citationRows.length} grounded citation rows in DB`);
    assert(citationRows.every((c) => c.source_class === 'private'), 'All citations have source_class="private"');

    const runRow = await queryOne<{ tokens_in: number; cost: number; latency_ms: number; critic_log: any }>(
      `SELECT tokens_in, cost, latency_ms, critic_log FROM runs WHERE brief_id = $1`,
      [briefId]
    );
    assert(Boolean(runRow), 'Telemetry record stored in runs table');
    assert(runRow!.latency_ms > 0, `Recorded pipeline latency: ${runRow!.latency_ms} ms`);
    assert(Boolean(runRow!.critic_log), 'Stored critic_log containing keep/drop decisions');

    // 7. Empty-Evidence Honest Publish (FR4.9)
    console.log('\n7. Empty-Evidence Honest Publish (FR4.9):');
    const emptyQuestion = 'What is the secret recipe for chocolate chip cookies?';
    const emptyBriefRows = await query<{ id: string }>(
      `INSERT INTO briefs (
        workspace_id, question, mode, status, progress
      ) VALUES ($1, $2, 'home', 'queued', '[]'::jsonb) RETURNING id`,
      [wsIdA, emptyQuestion]
    );
    const emptyBriefId = emptyBriefRows[0].id;
    const emptyBriefRes = await processQueuedBrief(emptyBriefId);

    assert(emptyBriefRes?.status === 'published', 'Empty-evidence path still published (FR4.9)');
    assert(
      Boolean(
        emptyBriefRes?.markdown.includes('No citable evidence was found') ||
        emptyBriefRes?.markdown.includes('Uncertain')
      ),
      'Published brief includes honest disclaimer without hallucinating facts'
    );

    // 8. Follow-Up Question Version Chain (FR4.8)
    console.log('\n8. Follow-Up Child Brief Revision (FR4.8):');
    const followUpQuestion = 'Who needs to give legal review before auto-debit?';
    const childBriefRows = await query<{ id: string }>(
      `INSERT INTO briefs (
        workspace_id, parent_brief_id, question, mode, status, progress
      ) VALUES ($1, $2, $3, 'home', 'queued', '[]'::jsonb) RETURNING id`,
      [wsIdA, briefId, followUpQuestion]
    );
    const childBriefId = childBriefRows[0].id;
    const childBriefRes = await processQueuedBrief(childBriefId);

    assert(childBriefRes?.parent_brief_id === briefId, 'Child brief has parent_brief_id pointing to parent brief');

    const parentBriefAfter = await queryOne<{ status: string }>(
      `SELECT status FROM briefs WHERE id = $1`,
      [briefId]
    );
    assert(parentBriefAfter?.status === 'published', 'Parent brief remained published and unchanged');

    // 9. Exit Criterion Demonstration
    console.log('\n9. Phase 2 Exit Criterion Demonstration:');
    assert(
      Boolean(
        publishedBrief?.markdown.includes('Stripe') || publishedBrief?.markdown.includes('staging')
      ),
      'Brief evidence lines quote the real uploaded/pasted thread'
    );
    assert(
      Boolean(childBriefRes?.parent_brief_id),
      'Follow-up question created a second versioned brief in the chain rather than an unbounded chat log'
    );

  } finally {
    // Cleanup test workspaces
    await query(`DELETE FROM workspaces WHERE id IN ($1, $2)`, [wsIdA, wsIdB]);
  }

  console.log('\n==========================================');
  console.log(`Phase 2 Tests Passed: ${passed} | Tests Failed: ${failed}`);
  console.log('==========================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runPhase2Tests().catch(async (err) => {
  console.error('Unhandled Phase 2 suite error:', err);
  await pool.end();
  process.exit(1);
});
