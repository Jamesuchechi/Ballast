import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import dotenv from 'dotenv';
dotenv.config();

process.env.EVAL_USE_MOCK = 'true';
process.env.NODE_ENV = 'test';

import { query, pool } from '../src/db/client';
import { createUserWithWorkspace, COOKIE_NAME } from '../src/lib/auth';
import { POST as syncSingleConnector } from '../src/app/api/connectors/[id]/sync/route';
import { POST as syncAllConnectors } from '../src/app/api/connectors/sync-all/route';
import { POST as resyncSource } from '../src/app/api/sources/[id]/resync/route';
import { storeEncryptedToken } from '../src/connectors/tokenStore';

describe('Feature E3 — Connector-level Re-sync Trigger & UI Sync Suite', () => {
  let userResult: any;
  let workspaceId: string;
  let cookieHeader: string;

  before(async () => {
    const email = `test_resync_${Date.now()}@ballast.local`;
    userResult = await createUserWithWorkspace({
      email,
      password: 'StrongPassword123!',
      name: 'Resync Test User',
      workspaceName: 'Resync Workspace',
    });
    workspaceId = userResult.workspace.id;
    cookieHeader = `${COOKIE_NAME}=${userResult.token}`;

    // Store mock credentials so connectors appear connected
    await storeEncryptedToken(workspaceId, 'gmail', {
      access_token: 'mock_gmail_access_token',
      refresh_token: 'mock_gmail_refresh_token',
      expiry_date: Date.now() + 3600000,
    });

    await storeEncryptedToken(workspaceId, 'github', {
      access_token: 'mock_github_access_token',
    });
  });

  after(async () => {
    await query(`DELETE FROM chunks WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM sources WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM oauth_tokens WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    await query(`DELETE FROM users WHERE id = $1`, [userResult.user.id]);
    await pool.end();
  });

  it('rejects unauthenticated requests to single sync, batch sync, and source re-sync with 401', async () => {
    const unauthReq = new NextRequest('http://localhost:3000/api/connectors/gmail/sync', {
      method: 'POST',
    });
    const res1 = await syncSingleConnector(unauthReq, { params: Promise.resolve({ id: 'gmail' }) });
    assert.equal(res1.status, 401);

    const res2 = await syncAllConnectors(unauthReq);
    assert.equal(res2.status, 401);

    const res3 = await resyncSource(unauthReq, { params: Promise.resolve({ id: 'src-123' }) });
    assert.equal(res3.status, 401);
  });

  it('returns 404 when syncing an invalid / unregistered connector ID', async () => {
    const req = new NextRequest('http://localhost:3000/api/connectors/non_existent_provider/sync', {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });
    const res = await syncSingleConnector(req, { params: Promise.resolve({ id: 'non_existent_provider' }) });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.ok(body.error.includes('not found in registry'));
  });

  it('triggers manual on-demand sync for an individual connector and records access_logs entry', async () => {
    const req = new NextRequest('http://localhost:3000/api/connectors/gmail/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: cookieHeader,
      },
      body: JSON.stringify({ windowDays: 90 }),
    });

    const res = await syncSingleConnector(req, { params: Promise.resolve({ id: 'gmail' }) });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.connectorId, 'gmail');
    assert.ok(typeof body.message === 'string');
    assert.ok(body.message.includes('Gmail synced:'));
    assert.ok(body.result.syncedCount >= 1);

    // Verify access_logs contains manual sync entry
    const auditLogs = await query<{ action: string }>(
      `SELECT action FROM access_logs WHERE workspace_id = $1 AND action LIKE 'connector_sync:manual:gmail%'`,
      [workspaceId]
    );
    assert.ok(auditLogs.length >= 1, 'Should have logged connector_sync:manual:gmail to access_logs');
  });

  it('triggers batch sync across all connected integrations in a workspace', async () => {
    const req = new NextRequest('http://localhost:3000/api/connectors/sync-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: cookieHeader,
      },
      body: JSON.stringify({ windowDays: 90 }),
    });

    const res = await syncAllConnectors(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.totalConnected >= 1);
    assert.ok(body.results['gmail']);
    assert.ok(typeof body.message === 'string');

    // Verify batch audit log
    const batchLogs = await query<{ action: string }>(
      `SELECT action FROM access_logs WHERE workspace_id = $1 AND action LIKE 'connector_sync:manual:batch%'`,
      [workspaceId]
    );
    assert.ok(batchLogs.length >= 1, 'Should have logged connector_sync:manual:batch to access_logs');
  });

  it('re-syncs an individual source record by ID and updates vector chunks', async () => {
    // Find a source that was created during previous sync
    const source = await query<{ id: string; external_id: string }>(
      `SELECT id, external_id FROM sources WHERE workspace_id = $1 AND connector = 'gmail' LIMIT 1`,
      [workspaceId]
    );
    assert.ok(source.length > 0, 'Must have at least one gmail source');
    const sourceId = source[0].id;

    const req = new NextRequest(`http://localhost:3000/api/sources/${sourceId}/resync`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
    });

    const res = await resyncSource(req, { params: Promise.resolve({ id: sourceId }) });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.chunkCount >= 1);
    assert.ok(typeof body.message === 'string');

    // Verify access_logs
    const sourceLogs = await query<{ action: string }>(
      `SELECT action FROM access_logs WHERE workspace_id = $1 AND action LIKE 'source_sync:manual:%'`,
      [workspaceId]
    );
    assert.ok(sourceLogs.length >= 1, 'Should have logged source_sync:manual to access_logs');
  });
});
