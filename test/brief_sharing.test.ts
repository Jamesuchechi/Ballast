import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import dotenv from 'dotenv';
dotenv.config();

process.env.EVAL_USE_MOCK = 'true';
process.env.NODE_ENV = 'test';

import { query, pool } from '../src/db/client';
import { createUserWithWorkspace, COOKIE_NAME } from '../src/lib/auth';
import { createShareToken, verifyShareToken } from '../src/lib/shareTokens';
import { POST as shareBriefRoute } from '../src/app/api/briefs/[id]/share/route';
import { GET as getSharedBriefRoute } from '../src/app/api/share/[token]/route';

describe('Feature E5 — Brief Sharing (Read-Only, Expiring Link) Suite', () => {
  let userResult: any;
  let workspaceId: string;
  let cookieHeader: string;
  let testBriefId: string;

  before(async () => {
    const email = `test_share_${Date.now()}@ballast.local`;
    userResult = await createUserWithWorkspace({
      email,
      password: 'StrongPassword123!',
      name: 'Share Test User',
      workspaceName: 'Share Test Workspace',
    });
    workspaceId = userResult.workspace.id;
    cookieHeader = `${COOKIE_NAME}=${userResult.token}`;

    // Insert a test brief in this workspace
    const insertRes = await query<{ id: string }>(
      `INSERT INTO briefs (workspace_id, question, mode, status, markdown, as_of, published_at)
       VALUES ($1, $2, 'home', 'published', $3, NOW(), NOW())
       RETURNING id`,
      [
        workspaceId,
        'What are the compliance and deliverable milestones for Q3?',
        '# What are the compliance and deliverable milestones for Q3?\n\n> **TL;DR:** All compliance milestones are on track for Q3 deployment.\n\n## 1. Executive Answer\nAll merchant account migrations and SOC 2 audits are scheduled.\n\n## 2. Key Evidence Fact-Claims\n- Claim: SOC 2 Type II audit report was signed off by Elena Rostova.\n\n## 3. Proposed Actions\n- Proposed Action: Finalize auto-debit consent wording.\n\n## 4. Unresolved Conflicts & Evidence Gaps\n- None.',
      ]
    );
    testBriefId = insertRes[0].id;
  });

  after(async () => {
    await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM briefs WHERE workspace_id = $1`, [workspaceId]);
    await query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
    await query(`DELETE FROM users WHERE id = $1`, [userResult.user.id]);
    await pool.end();
  });

  it('creates and verifies a valid HMAC-signed share token', () => {
    const { token, expiresAt, exp } = createShareToken(testBriefId, workspaceId, 72);
    assert.ok(token, 'Token string should be generated');
    assert.ok(token.includes('.'), 'Token should be format payload.signature');
    assert.ok(expiresAt, 'expiresAt ISO date should be present');
    assert.ok(exp > Math.floor(Date.now() / 1000), 'exp should be in the future');

    const verified = verifyShareToken(token);
    assert.ok(verified, 'Verification should succeed for valid token');
    assert.equal(verified?.briefId, testBriefId);
    assert.equal(verified?.workspaceId, workspaceId);
    assert.equal(verified?.type, 'read_only_brief');
  });

  it('rejects tampered or forged share tokens', () => {
    const { token } = createShareToken(testBriefId, workspaceId, 72);
    const [data, sig] = token.split('.');

    // Alter data payload
    const forgedData = Buffer.from(JSON.stringify({ briefId: 'other-id', workspaceId, exp: 9999999999, type: 'read_only_brief' })).toString('base64url');
    const tamperedToken = `${forgedData}.${sig}`;

    const verified = verifyShareToken(tamperedToken);
    assert.equal(verified, null, 'Tampered token must fail HMAC signature check');
  });

  it('rejects expired share tokens', () => {
    // Create token that expired 10 hours ago
    const { token } = createShareToken(testBriefId, workspaceId, -10);
    const verified = verifyShareToken(token);
    assert.equal(verified, null, 'Expired token must return null');
  });

  it('POST /api/briefs/[id]/share rejects unauthenticated requests with 401', async () => {
    const unauthReq = new NextRequest(`http://localhost:3000/api/briefs/${testBriefId}/share`, {
      method: 'POST',
      body: JSON.stringify({ expiresInHours: 72 }),
    });
    const res = await shareBriefRoute(unauthReq, { params: Promise.resolve({ id: testBriefId }) });
    assert.equal(res.status, 401);
  });

  it('POST /api/briefs/[id]/share generates a valid share URL and records access log', async () => {
    const req = new NextRequest(`http://localhost:3000/api/briefs/${testBriefId}/share`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresInHours: 168 }), // 7 days
    });
    const res = await shareBriefRoute(req, { params: Promise.resolve({ id: testBriefId }) });
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.shareUrl.includes('/share/'));
    assert.equal(data.expiresInHours, 168);
    assert.ok(data.token);

    // Verify audit log entry
    const logs = await query(
      `SELECT * FROM access_logs WHERE workspace_id = $1 AND action = 'brief_share:create'`,
      [workspaceId]
    );
    assert.ok(logs.length > 0, 'Audit log entry should be recorded');
  });

  it('GET /api/share/[token] publicly retrieves sanitized brief without exposing internal details', async () => {
    const { token } = createShareToken(testBriefId, workspaceId, 72);

    const req = new NextRequest(`http://localhost:3000/api/share/${token}`, {
      method: 'GET',
    });
    const res = await getSharedBriefRoute(req, { params: Promise.resolve({ token }) });
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(data.brief, 'Brief payload should be returned');
    assert.equal(data.brief.id, testBriefId);
    assert.ok(data.brief.markdown.includes('Executive Answer'));
    assert.ok(data.brief.question.includes('Q3'));
    assert.ok(data.expiresAt);
    assert.equal(data.isExpired, false);

    // Privacy verification: confirm zero source connection tokens or raw private URIs exposed
    assert.equal((data.brief as any).sources, undefined);
    assert.equal((data.brief as any).oauth_tokens, undefined);
    assert.equal((data.brief as any).workspace_members, undefined);
  });

  it('GET /api/share/[token] returns 401 for an expired token', async () => {
    const { token } = createShareToken(testBriefId, workspaceId, -5);

    const req = new NextRequest(`http://localhost:3000/api/share/${token}`, {
      method: 'GET',
    });
    const res = await getSharedBriefRoute(req, { params: Promise.resolve({ token }) });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.includes('expired'));
  });
});
