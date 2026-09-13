import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config();

import { getRedisUrl, getRedisOptions, createRedisClient } from '../src/queue/redis';
import { getBriefQueue, enqueueBriefJob, closeBriefQueue } from '../src/queue/briefQueue';
import { createBriefWorker } from '../src/worker';
import { query, queryOne, pool } from '../src/db/client';

async function runQueueTests() {
  console.log('=== Ballast Queue & Upstash Redis Integration Test Suite ===\n');

  // Test 1: Upstash Redis URL derivation and BullMQ options
  console.log('[Test 1] Testing Redis configuration & Upstash auto-derivation...');
  const originalEnv = { ...process.env };

  try {
    // 1a. Upstash REST credentials derivation
    delete process.env.UPSTASH_REDIS_URL;
    delete process.env.REDIS_URL;
    process.env.UPSTASH_REDIS_REST_URL = 'https://delicate-quail-12345.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'mockUpstashTokenXYZ';

    const derivedUrl = getRedisUrl();
    assert.equal(
      derivedUrl,
      'rediss://default:mockUpstashTokenXYZ@delicate-quail-12345.upstash.io:6379',
      'Should derive rediss:// URL from Upstash REST URL + Token'
    );

    const upstashOptions = getRedisOptions();
    assert.equal(upstashOptions.maxRetriesPerRequest, null, 'maxRetriesPerRequest must be null for BullMQ');
    assert.equal(upstashOptions.enableReadyCheck, false, 'enableReadyCheck must be false for Upstash serverless');
    assert.ok(upstashOptions.tls, 'TLS options must be enabled for Upstash rediss://');

    // 1b. Direct Upstash rediss:// URL
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.UPSTASH_REDIS_URL = 'rediss://default:directPass@my-db.upstash.io:6379';
    assert.equal(getRedisUrl(), 'rediss://default:directPass@my-db.upstash.io:6379');
    assert.ok(getRedisOptions().tls, 'TLS options must be present for rediss:// URL');

    console.log('✓ Upstash connection derivation and BullMQ options verified.');
  } finally {
    process.env = originalEnv;
  }

  // Test 2: Local Redis Ping test
  console.log('\n[Test 2] Connecting to local Redis and verifying PING...');
  const redis = createRedisClient();
  const pingRes = await redis.ping();
  assert.equal(pingRes, 'PONG', 'Redis did not return PONG');
  console.log('✓ Redis connection established and responded with PONG.');

  // Test 3: BullMQ Queue Enqueue & Idempotency
  console.log('\n[Test 3] Testing BullMQ queue instantiation & idempotent enqueue...');
  const queue = getBriefQueue();
  // Clear any leftover jobs from previous runs
  await queue.drain();
  const testBriefId = 'a0000000-0000-0000-0000-000000000002';
  const testWorkspaceId = '00000000-0000-0000-0000-000000000001';

  const jobId1 = await enqueueBriefJob(testBriefId, { workspaceId: testWorkspaceId });
  assert.equal(jobId1, `brief-${testBriefId}`);

  // Retrieve job from queue
  const job = await queue.getJob(jobId1);
  assert.ok(job, 'Job should exist in BullMQ queue');
  assert.equal(job.data.briefId, testBriefId);
  assert.equal(job.data.workspaceId, testWorkspaceId);

  // Enqueue same briefId again (idempotency check)
  const jobId2 = await enqueueBriefJob(testBriefId, { workspaceId: testWorkspaceId });
  assert.equal(jobId2, jobId1, 'Enqueueing same brief must return the same job ID (idempotent)');

  // Clean up this job so worker in Test 4 doesn't pick up an uninserted DB brief
  await job.remove();

  console.log('✓ BullMQ job enqueue and idempotency verified.');

  // Test 4: End-to-end Worker Execution
  console.log('\n[Test 4] Testing worker job processing with PostgreSQL brief lifecycle...');
  // Ensure workspace exists
  await query(
    `INSERT INTO workspaces (id, name) 
     VALUES ($1, 'Queue Test Workspace') 
     ON CONFLICT (id) DO NOTHING`,
    [testWorkspaceId]
  );

  // Insert a test brief in database
  const briefInsert = await query<{ id: string }>(
    `INSERT INTO briefs (
       workspace_id, question, mode, status, progress, stale_after
     ) VALUES (
       $1, 'What is the deployment schedule?', 'home', 'queued',
       $2::jsonb, NOW() + INTERVAL '1 day'
     ) RETURNING id`,
    [
      testWorkspaceId,
      JSON.stringify([{ step: 'queued', timestamp: new Date().toISOString() }]),
    ]
  );
  const liveBriefId = briefInsert[0].id;

  // Set EVAL_USE_MOCK=true for fast, reliable deterministic test execution
  process.env.EVAL_USE_MOCK = 'true';

  // Start worker
  const worker = createBriefWorker(1);

  // Listen for completion
  const workerCompletedPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Worker timed out waiting to complete job'));
    }, 45000);

    worker.on('completed', async (completedJob) => {
      if (completedJob.data.briefId === liveBriefId) {
        clearTimeout(timeout);
        resolve();
      }
    });

    worker.on('failed', (failedJob, err) => {
      if (failedJob?.data.briefId === liveBriefId) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });

  // Enqueue live brief job
  await enqueueBriefJob(liveBriefId, { workspaceId: testWorkspaceId });

  // Wait for worker to finish
  await workerCompletedPromise;

  // Check brief in database
  const updatedBrief = await queryOne<{ status: string; markdown: string | null }>(
    `SELECT status, markdown FROM briefs WHERE id = $1`,
    [liveBriefId]
  );

  assert.ok(updatedBrief, 'Brief must exist in database');
  assert.equal(updatedBrief.status, 'published', `Expected status published, got ${updatedBrief.status}`);
  assert.ok(updatedBrief.markdown && updatedBrief.markdown.length > 50, 'Brief should have rendered markdown');
  console.log('✓ Worker processed brief job and updated status to "published" with rendered markdown.');

  // Clean up
  console.log('\n[Teardown] Cleaning up worker, queue, and redis connections...');
  await worker.close();
  await closeBriefQueue();
  await redis.quit();
  await pool.end();
  console.log('✓ All queue resources closed cleanly.');

  console.log('\n=== All Queue & Worker Tests Passed! ===\n');
  process.exit(0);
}

runQueueTests().catch(async (err) => {
  console.error('❌ Queue test suite failed:', err);
  await closeBriefQueue().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
