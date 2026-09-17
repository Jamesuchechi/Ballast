import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import dotenv from 'dotenv';
dotenv.config();

process.env.EVAL_USE_MOCK = 'true';
process.env.NODE_ENV = 'test';

import { query, pool } from '../src/db/client';
import { createUserWithWorkspace, COOKIE_NAME } from '../src/lib/auth';
import { GET as getBriefsRoute } from '../src/app/api/briefs/route';
import { PATCH as patchBriefRoute, GET as getBriefDetailRoute } from '../src/app/api/briefs/[id]/route';

describe('Feature E7 — Brief Bookmarks / Star Suite', () => {
  let user1: any;
  let workspace1: string;
  let cookie1: string;

  let user2: any;
  let workspace2: string;
  let cookie2: string;

  let brief1Id: string;
  let brief2Id: string;

  before(async () => {
    // Workspace 1
    const email1 = `test_star_user1_${Date.now()}@ballast.local`;
    user1 = await createUserWithWorkspace({
      email: email1,
      password: 'StrongPassword123!',
      name: 'Star User 1',
      workspaceName: 'Star Workspace 1',
    });
    workspace1 = user1.workspace.id;
    cookie1 = `${COOKIE_NAME}=${user1.token}`;

    // Workspace 2
    const email2 = `test_star_user2_${Date.now()}@ballast.local`;
    user2 = await createUserWithWorkspace({
      email: email2,
      password: 'StrongPassword123!',
      name: 'Star User 2',
      workspaceName: 'Star Workspace 2',
    });
    workspace2 = user2.workspace.id;
    cookie2 = `${COOKIE_NAME}=${user2.token}`;

    // Insert briefs into workspace 1
    const b1 = await query<{ id: string }>(
      `INSERT INTO briefs (workspace_id, question, mode, status, markdown, as_of)
       VALUES ($1, 'Q3 Billing Revamp Analysis', 'home', 'published', '# Markdown 1', NOW())
       RETURNING id`,
      [workspace1]
    );
    brief1Id = b1[0].id;

    const b2 = await query<{ id: string }>(
      `INSERT INTO briefs (workspace_id, question, mode, status, markdown, as_of)
       VALUES ($1, 'Stripe Webhook Signature Verification', 'world', 'published', '# Markdown 2', NOW())
       RETURNING id`,
      [workspace1]
    );
    brief2Id = b2[0].id;
  });

  after(async () => {
    await query(`DELETE FROM briefs WHERE workspace_id IN ($1, $2)`, [workspace1, workspace2]);
    await query(`DELETE FROM workspaces WHERE id IN ($1, $2)`, [workspace1, workspace2]);
    await query(`DELETE FROM users WHERE id IN ($1, $2)`, [user1.user.id, user2.user.id]);
    await pool.end();
  });

  it('rejects unauthenticated PATCH /api/briefs/[id] with 401', async () => {
    const unauthReq = new NextRequest(`http://localhost:3000/api/briefs/${brief1Id}`, {
      method: 'PATCH',
      body: JSON.stringify({ starred: true }),
    });
    const res = await patchBriefRoute(unauthReq, { params: Promise.resolve({ id: brief1Id }) });
    assert.equal(res.status, 401);
  });

  it('stars a brief via PATCH /api/briefs/[id] and persists to database', async () => {
    const req = new NextRequest(`http://localhost:3000/api/briefs/${brief1Id}`, {
      method: 'PATCH',
      headers: {
        cookie: cookie1,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ starred: true }),
    });
    const res = await patchBriefRoute(req, { params: Promise.resolve({ id: brief1Id }) });
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.brief.starred, true);

    // Verify in database
    const dbRow = await query<{ starred: boolean }>(`SELECT starred FROM briefs WHERE id = $1`, [brief1Id]);
    assert.equal(dbRow[0].starred, true);
  });

  it('unstars a brief via PATCH /api/briefs/[id]', async () => {
    const req = new NextRequest(`http://localhost:3000/api/briefs/${brief1Id}`, {
      method: 'PATCH',
      headers: {
        cookie: cookie1,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ starred: false }),
    });
    const res = await patchBriefRoute(req, { params: Promise.resolve({ id: brief1Id }) });
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.brief.starred, false);

    const dbRow = await query<{ starred: boolean }>(`SELECT starred FROM briefs WHERE id = $1`, [brief1Id]);
    assert.equal(dbRow[0].starred, false);
  });

  it('returns starred boolean field in GET /api/briefs', async () => {
    // Star brief2
    await query(`UPDATE briefs SET starred = true WHERE id = $1`, [brief2Id]);

    const req = new NextRequest('http://localhost:3000/api/briefs', {
      method: 'GET',
      headers: { cookie: cookie1 },
    });
    const res = await getBriefsRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.briefs));

    const item1 = data.briefs.find((b: any) => b.id === brief1Id);
    const item2 = data.briefs.find((b: any) => b.id === brief2Id);

    assert.equal(item1.starred, false);
    assert.equal(item2.starred, true);
  });

  it('filters by starred=true in GET /api/briefs?starred=true', async () => {
    const req = new NextRequest('http://localhost:3000/api/briefs?starred=true', {
      method: 'GET',
      headers: { cookie: cookie1 },
    });
    const res = await getBriefsRoute(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.briefs.length, 1);
    assert.equal(data.briefs[0].id, brief2Id);
    assert.equal(data.briefs[0].starred, true);
  });

  it('enforces workspace isolation: user in workspace 2 cannot star brief from workspace 1', async () => {
    const crossReq = new NextRequest(`http://localhost:3000/api/briefs/${brief1Id}`, {
      method: 'PATCH',
      headers: {
        cookie: cookie2,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ starred: true }),
    });
    const res = await patchBriefRoute(crossReq, { params: Promise.resolve({ id: brief1Id }) });
    assert.equal(res.status, 404);
  });
});
