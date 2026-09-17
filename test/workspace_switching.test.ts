import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createUserWithWorkspace, COOKIE_NAME, signToken, verifyToken } from '../src/lib/auth';
import { GET as getWorkspaces, POST as createWorkspace } from '../src/app/api/workspaces/route';
import { POST as switchWorkspace } from '../src/app/api/workspaces/switch/route';
import { query, queryOne } from '../src/db/client';

describe('Missing Feature M4 - Multi-Workspace Management & Switching', () => {
  it('allows a user to list all their workspaces with member counts and active flags', async () => {
    // Create test user with primary workspace
    const email = `test_ws_switcher_${Date.now()}@example.com`;
    const userResult = await createUserWithWorkspace({
      email,
      password: 'StrongPassword123!',
      name: 'Multi Workspace User',
      workspaceName: 'Primary Workspace',
    });

    // Create a mock request with the user's session cookie
    const req = new NextRequest('http://localhost:3000/api/workspaces', {
      headers: {
        cookie: `${COOKIE_NAME}=${userResult.token}`,
      },
    });

    const res = await getWorkspaces(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.workspaces));
    assert.ok(data.workspaces.length >= 1);
    assert.equal(data.currentWorkspaceId, userResult.workspace.id);

    const primary = data.workspaces.find((w: any) => w.id === userResult.workspace.id);
    assert.ok(primary);
    assert.equal(primary.name, 'Primary Workspace');
    assert.equal(primary.role, 'owner');
    assert.equal(primary.isCurrent, true);
    assert.equal(primary.memberCount, 1);
  });

  it('allows a user to create a new secondary workspace and auto-switches to it', async () => {
    const email = `test_ws_creator_${Date.now()}@example.com`;
    const userResult = await createUserWithWorkspace({
      email,
      password: 'StrongPassword123!',
      name: 'Creator User',
      workspaceName: 'First Org',
    });

    const createReq = new NextRequest('http://localhost:3000/api/workspaces', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${COOKIE_NAME}=${userResult.token}`,
      },
      body: JSON.stringify({
        name: 'Engineering & R&D Team',
        plan: 'operator',
      }),
    });

    const res = await createWorkspace(createReq);
    assert.equal(res.status, 201);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.workspace.name, 'Engineering & R&D Team');
    assert.equal(data.workspace.role, 'owner');
    assert.equal(data.workspace.isCurrent, true);

    // Verify session cookie was set with the new workspace ID
    const setCookie = res.cookies.get(COOKIE_NAME);
    assert.ok(setCookie?.value);
    const payload = verifyToken(setCookie.value);
    assert.equal(payload?.workspaceId, data.workspace.id);
    assert.equal(payload?.userId, userResult.user.id);
  });

  it('allows a user to switch back and forth between multiple workspaces', async () => {
    const email = `test_switch_user_${Date.now()}@example.com`;
    const userResult = await createUserWithWorkspace({
      email,
      password: 'StrongPassword123!',
      name: 'Switch User',
      workspaceName: 'Workspace Alpha',
    });

    // Add user to a second workspace directly in DB
    const wsBeta = await queryOne<{ id: string; name: string }>(
      `INSERT INTO workspaces (name, plan) VALUES ('Workspace Beta', 'pro') RETURNING id, name`
    );
    assert.ok(wsBeta);
    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'member')`,
      [wsBeta.id, userResult.user.id]
    );

    // Switch active workspace to Beta
    const switchReq = new NextRequest('http://localhost:3000/api/workspaces/switch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${COOKIE_NAME}=${userResult.token}`,
      },
      body: JSON.stringify({ workspaceId: wsBeta.id }),
    });

    const switchRes = await switchWorkspace(switchReq);
    assert.equal(switchRes.status, 200);

    const switchData = await switchRes.json();
    assert.equal(switchData.success, true);
    assert.equal(switchData.workspace.id, wsBeta.id);
    assert.equal(switchData.workspace.role, 'member');

    const betaCookie = switchRes.cookies.get(COOKIE_NAME);
    assert.ok(betaCookie?.value);
    const betaPayload = verifyToken(betaCookie.value);
    assert.equal(betaPayload?.workspaceId, wsBeta.id);
    assert.equal(betaPayload?.role, 'member');

    // Switch back to Alpha
    const switchBackReq = new NextRequest('http://localhost:3000/api/workspaces/switch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${COOKIE_NAME}=${betaCookie.value}`,
      },
      body: JSON.stringify({ workspaceId: userResult.workspace.id }),
    });

    const switchBackRes = await switchWorkspace(switchBackReq);
    assert.equal(switchBackRes.status, 200);

    const switchBackData = await switchBackRes.json();
    assert.equal(switchBackData.workspace.id, userResult.workspace.id);
    assert.equal(switchBackData.workspace.role, 'owner');
  });

  it('rejects switching to a workspace the user is not a member of', async () => {
    const email = `test_unauthorized_ws_${Date.now()}@example.com`;
    const userResult = await createUserWithWorkspace({
      email,
      password: 'StrongPassword123!',
      name: 'Unauthorized User',
      workspaceName: 'Isolated Workspace',
    });

    // Create a foreign workspace where this user has no membership
    const foreignWs = await queryOne<{ id: string }>(
      `INSERT INTO workspaces (name, plan) VALUES ('Foreign Secret Workspace', 'operator') RETURNING id`
    );
    assert.ok(foreignWs);

    const switchReq = new NextRequest('http://localhost:3000/api/workspaces/switch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${COOKIE_NAME}=${userResult.token}`,
      },
      body: JSON.stringify({ workspaceId: foreignWs.id }),
    });

    const switchRes = await switchWorkspace(switchReq);
    assert.equal(switchRes.status, 403);
    const errData = await switchRes.json();
    assert.ok(errData.error.includes('do not have access'));
  });
});
