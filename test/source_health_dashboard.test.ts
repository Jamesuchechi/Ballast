import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import dotenv from 'dotenv';
dotenv.config();

process.env.EVAL_USE_MOCK = 'true';
process.env.NODE_ENV = 'test';

import { query, pool } from '../src/db/client';
import { createUserWithWorkspace, COOKIE_NAME } from '../src/lib/auth';
import { GET as getSourceHealthRoute } from '../src/app/api/sources/health/route';

describe('Feature E8 — Source Health Dashboard Suite', () => {
  let user1: any;
  let workspace1: string;
  let cookie1: string;

  let user2: any;
  let workspace2: string;
  let cookie2: string;

  let source1Id: string;
  let source2Id: string;
  let source3ErrorId: string;

  before(async () => {
    // Workspace 1 setup
    const email1 = `test_health_user1_${Date.now()}@ballast.local`;
    user1 = await createUserWithWorkspace({
      email: email1,
      password: 'StrongPassword123!',
      name: 'Health User 1',
      workspaceName: 'Health Workspace 1',
    });
    workspace1 = user1.workspace.id;
    cookie1 = `${COOKIE_NAME}=${user1.token}`;

    // Workspace 2 setup
    const email2 = `test_health_user2_${Date.now()}@ballast.local`;
    user2 = await createUserWithWorkspace({
      email: email2,
      password: 'StrongPassword123!',
      name: 'Health User 2',
      workspaceName: 'Health Workspace 2',
    });
    workspace2 = user2.workspace.id;
    cookie2 = `${COOKIE_NAME}=${user2.token}`;

    // Seed Workspace 1 sources
    // 1. Gmail source with 3 chunks
    const s1 = await query<{ id: string }>(
      `INSERT INTO sources (workspace_id, connector, external_id, checksum, trust_boundary, synced_at, meta)
       VALUES ($1, 'gmail', 'msg_1001', 'chk_1001', 'untrusted_content', NOW() - INTERVAL '10 minutes', '{"subject": "Q3 Planning"}')
       RETURNING id`,
      [workspace1]
    );
    source1Id = s1[0].id;

    for (let i = 0; i < 3; i++) {
      await query(
        `INSERT INTO chunks (workspace_id, source_id, text, ordinal)
         VALUES ($1, $2, $3, $4)`,
        [workspace1, source1Id, `Gmail chunk ${i} discussion text content.`, i]
      );
    }

    // 2. Drive source with 2 chunks
    const s2 = await query<{ id: string }>(
      `INSERT INTO sources (workspace_id, connector, external_id, checksum, trust_boundary, synced_at, meta)
       VALUES ($1, 'drive', 'doc_2002', 'chk_2002', 'verified', NOW() - INTERVAL '1 hour', '{"title": "Architecture Spec.pdf"}')
       RETURNING id`,
      [workspace1]
    );
    source2Id = s2[0].id;

    for (let i = 0; i < 2; i++) {
      await query(
        `INSERT INTO chunks (workspace_id, source_id, text, ordinal)
         VALUES ($1, $2, $3, $4)`,
        [workspace1, source2Id, `Drive architecture doc chunk ${i}.`, i]
      );
    }

    // 3. GitHub source with an error
    const s3 = await query<{ id: string }>(
      `INSERT INTO sources (workspace_id, connector, external_id, checksum, trust_boundary, synced_at, last_error, meta)
       VALUES ($1, 'github', 'repo_3003', 'chk_3003', 'untrusted_content', NOW() - INTERVAL '2 hours', 'Rate limit exceeded: 403 Forbidden', '{"name": "org/ballast-core"}')
       RETURNING id`,
      [workspace1]
    );
    source3ErrorId = s3[0].id;

    // Seed access logs for Workspace 1
    await query(
      `INSERT INTO access_logs (workspace_id, source_id, action, created_at)
       VALUES ($1, $2, 'source_sync_completed', NOW() - INTERVAL '10 minutes'),
              ($1, $3, 'vector_indexed', NOW() - INTERVAL '1 hour'),
              ($1, $4, 'sync_error:rate_limit', NOW() - INTERVAL '2 hours')`,
      [workspace1, source1Id, source2Id, source3ErrorId]
    );

    // Seed Workspace 2 source (should NOT be visible to Workspace 1)
    const sOther = await query<{ id: string }>(
      `INSERT INTO sources (workspace_id, connector, external_id, checksum, trust_boundary, synced_at, meta)
       VALUES ($1, 'slack', 'slack_msg_9999', 'chk_9999', 'untrusted_content', NOW(), '{"channel": "#secret"}')
       RETURNING id`,
      [workspace2]
    );
    await query(
      `INSERT INTO chunks (workspace_id, source_id, text, ordinal)
       VALUES ($1, $2, 'Confidential Slack message chunk', 0)`,
      [workspace2, sOther[0].id]
    );
    await query(
      `INSERT INTO access_logs (workspace_id, source_id, action, created_at)
       VALUES ($1, $2, 'slack_private_sync', NOW())`,
      [workspace2, sOther[0].id]
    );
  });

  after(async () => {
    // Clean up
    if (workspace1) {
      await query(`DELETE FROM workspaces WHERE id = $1`, [workspace1]).catch(() => {});
    }
    if (workspace2) {
      await query(`DELETE FROM workspaces WHERE id = $1`, [workspace2]).catch(() => {});
    }
  });

  it('1. GET /api/sources/health returns 401 for unauthenticated requests', async () => {
    const req = new NextRequest('http://localhost:3000/api/sources/health', {
      method: 'GET',
    });
    const res = await getSourceHealthRoute(req);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
  });

  it('2. GET /api/sources/health computes workspace-level KPI metrics correctly', async () => {
    const req = new NextRequest('http://localhost:3000/api/sources/health', {
      method: 'GET',
      headers: {
        cookie: cookie1,
      },
    });
    const res = await getSourceHealthRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.summary, 'Summary object must exist');
    assert.strictEqual(data.summary.totalSources, 3, 'Total sources should be 3');
    assert.strictEqual(data.summary.totalChunks, 5, 'Total chunks should be 3 + 2 = 5');
    assert.strictEqual(data.summary.errorConnectorsCount, 1, '1 connector in error status');
    assert.strictEqual(data.summary.overallStatus, 'error', 'Overall status should flag error');
    assert.ok(data.summary.lastSyncedAt, 'Last sync timestamp must exist');
  });

  it('3. GET /api/sources/health aggregates chunk counts and status per connector', async () => {
    const req = new NextRequest('http://localhost:3000/api/sources/health', {
      method: 'GET',
      headers: {
        cookie: cookie1,
      },
    });
    const res = await getSourceHealthRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    const gmailConn = data.connectors.find((c: any) => c.connector === 'gmail');
    assert.ok(gmailConn, 'Gmail connector should be present');
    assert.strictEqual(gmailConn.sourceCount, 1);
    assert.strictEqual(gmailConn.chunkCount, 3);
    assert.strictEqual(gmailConn.status, 'healthy');
    assert.strictEqual(gmailConn.lastError, null);

    const driveConn = data.connectors.find((c: any) => c.connector === 'drive');
    assert.ok(driveConn, 'Drive connector should be present');
    assert.strictEqual(driveConn.sourceCount, 1);
    assert.strictEqual(driveConn.chunkCount, 2);
    assert.strictEqual(driveConn.status, 'healthy');

    const githubConn = data.connectors.find((c: any) => c.connector === 'github');
    assert.ok(githubConn, 'GitHub connector should be present');
    assert.strictEqual(githubConn.sourceCount, 1);
    assert.strictEqual(githubConn.status, 'error');
    assert.match(githubConn.lastError, /Rate limit exceeded/);
  });

  it('4. GET /api/sources/health streams recent ingestion and sync access logs', async () => {
    const req = new NextRequest('http://localhost:3000/api/sources/health', {
      method: 'GET',
      headers: {
        cookie: cookie1,
      },
    });
    const res = await getSourceHealthRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.recentLogs), 'recentLogs should be an array');
    assert.ok(data.recentLogs.length >= 3, 'Should return at least 3 access logs');
    const actions = data.recentLogs.map((l: any) => l.action);
    assert.ok(actions.includes('source_sync_completed'), 'Should contain source_sync_completed');
    assert.ok(actions.includes('vector_indexed'), 'Should contain vector_indexed');
    assert.ok(actions.includes('sync_error:rate_limit'), 'Should contain sync_error:rate_limit');
  });

  it('5. GET /api/sources/health isolates data across tenant workspaces', async () => {
    const req = new NextRequest('http://localhost:3000/api/sources/health', {
      method: 'GET',
      headers: {
        cookie: cookie2,
      },
    });
    const res = await getSourceHealthRoute(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // Workspace 2 only has Slack
    assert.strictEqual(data.summary.totalSources, 1);
    assert.strictEqual(data.summary.totalChunks, 1);
    assert.strictEqual(data.summary.errorConnectorsCount, 0);
    assert.strictEqual(data.summary.overallStatus, 'healthy');

    // Make sure no Gmail, Drive, or GitHub sources from Workspace 1 leaked
    const ws2Connectors = data.sources.map((s: any) => s.connector);
    assert.ok(!ws2Connectors.includes('gmail'), 'Must not leak Gmail from WS1');
    assert.ok(!ws2Connectors.includes('drive'), 'Must not leak Drive from WS1');
    assert.ok(!ws2Connectors.includes('github'), 'Must not leak GitHub from WS1');
    assert.ok(ws2Connectors.includes('slack'), 'Should contain Slack from WS2');

    // Make sure access logs are isolated
    const ws2Logs = data.recentLogs.map((l: any) => l.action);
    assert.ok(ws2Logs.includes('slack_private_sync'));
    assert.ok(!ws2Logs.includes('source_sync_completed'));
  });
});
