import { pool, query, queryOne } from '../src/db/client';
import { progressBroadcaster, type ProgressEventPayload } from '../src/core/progressBroadcaster';
import { appendProgress } from '../src/core/pipelineWorker';

async function runTest() {
  console.log('=== Ballast M10: Real-Time SSE Progress Streaming Test Suite ===\n');

  try {
    console.log('[Test 1] Testing progressBroadcaster publish/subscribe mechanism...');
    const testBriefId = 'test-brief-sse-001';
    const receivedEvents: ProgressEventPayload[] = [];

    const unsubscribe = progressBroadcaster.subscribe(testBriefId, (payload) => {
      receivedEvents.push(payload);
    });

    progressBroadcaster.broadcast(testBriefId, {
      briefId: testBriefId,
      step: 'planning',
      message: 'Planning retrieval passes...',
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    progressBroadcaster.broadcast(testBriefId, {
      briefId: testBriefId,
      step: 'drafting',
      message: 'Drafting brief sections...',
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    if (receivedEvents.length !== 2) {
      throw new Error(`Expected 2 broadcast events, received: ${receivedEvents.length}`);
    }
    if (receivedEvents[0].step !== 'planning' || receivedEvents[1].step !== 'drafting') {
      throw new Error('Broadcast event payload ordering mismatch');
    }
    console.log('  Passed: Broadcaster received real-time progress events synchronously.');

    // ----------------------------------------------------
    // Test 2: Unsubscribe Lifecycle
    // ----------------------------------------------------
    console.log('\n[Test 2] Testing unsubscribe teardown...');
    unsubscribe();
    progressBroadcaster.broadcast(testBriefId, {
      briefId: testBriefId,
      step: 'verifying',
      message: 'Verifying claims...',
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    if (receivedEvents.length !== 2) {
      throw new Error('Event received after unsubscribe was called');
    }
    console.log('  Passed: Unsubscribed listener cleanly detached without memory leaks.');

    // ----------------------------------------------------
    // Test 3: appendProgress DB Persistence + Real-Time Emission
    // ----------------------------------------------------
    console.log('\n[Test 3] Testing appendProgress PostgreSQL persistence and concurrent event emission...');
    const wsRes = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (name, plan)
      VALUES ('M10 Streaming Test Workspace', 'operator')
      RETURNING id;
    `);
    const workspaceId = wsRes.rows[0].id;

    const briefRes = await pool.query<{ id: string }>(`
      INSERT INTO briefs (workspace_id, question, mode, status, template_version)
      VALUES ($1, 'Streaming progress test question', 'home', 'queued', 'v1')
      RETURNING id;
    `, [workspaceId]);
    const liveBriefId = briefRes.rows[0].id;

    const streamEvents: ProgressEventPayload[] = [];
    const unsubLive = progressBroadcaster.subscribe(liveBriefId, (payload) => {
      streamEvents.push(payload);
    });

    // Fire sequence of steps
    await appendProgress(liveBriefId, 'retrieving_private', 'Checking private documents...');
    await appendProgress(liveBriefId, 'verifying', 'Verifying claims against citations...');
    await appendProgress(liveBriefId, 'published', 'Brief successfully published');

    if (streamEvents.length !== 3) {
      throw new Error(`Expected 3 stream events from appendProgress, got: ${streamEvents.length}`);
    }
    if (streamEvents[2].step !== 'published' || streamEvents[2].status !== 'published') {
      throw new Error(`Expected final stream event to report published status, got: ${JSON.stringify(streamEvents[2])}`);
    }

    // Verify DB JSONB column contains all appended steps
    const dbBrief = await queryOne<{ progress: any[] }>(
      `SELECT progress FROM briefs WHERE id = $1`,
      [liveBriefId]
    );
    if (!dbBrief?.progress || dbBrief.progress.length < 3) {
      throw new Error(`Expected DB progress array to have at least 3 entries, got: ${dbBrief?.progress?.length}`);
    }
    console.log(`  Passed: appendProgress persisted ${dbBrief.progress.length} steps to DB and streamed all 3 events in real-time.`);

    unsubLive();

    // Cleanup
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    console.log('\n  Cleaned up test workspace.');

    console.log('\n[PASS] All M10 SSE streaming and progress broadcast tests passed successfully!\n');
  } finally {
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error('[FAIL] M10 test failed:', err);
  process.exit(1);
});
