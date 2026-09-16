import crypto from 'crypto';
import { query, queryOne } from '@/db/client';

const SESSION_SECRET = process.env.SESSION_SECRET || 'ballast_super_secret_session_key_for_dev_32b';
const COOKIE_NAME = 'ballast_session';

export interface User {
  id: string;
  email: string;
  name: string | null;
  session_version?: number;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: string;
  role?: string;
  created_at: string;
}

export interface SessionPayload {
  userId: string;
  workspaceId: string;
  email: string;
  role: string;
  sessionVersion?: number;
  exp: number; // Unix timestamp in seconds
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

export function signToken(payload: SessionPayload): string {
  const tokenPayload: SessionPayload = {
    ...payload,
    sessionVersion: payload.sessionVersion ?? 1,
  };
  const data = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Increment the user's session_version in the database, invalidating all existing session tokens.
 */
export async function invalidateUserSessions(userId: string): Promise<number> {
  const result = await queryOne<{ session_version: number }>(
    `UPDATE users 
     SET session_version = COALESCE(session_version, 1) + 1 
     WHERE id = $1 
     RETURNING session_version`,
    [userId]
  );
  return result?.session_version ?? 1;
}

/**
 * Asynchronously verifies the token signature, verifies that the token's
 * sessionVersion matches the current session_version stored in the database,
 * and confirms that the workspace still exists and the user is an active member.
 */
export async function validateSessionToken(token: string): Promise<SessionPayload | null> {
  const payload = verifyToken(token);
  if (!payload || !payload.userId) return null;

  try {
    const user = await queryOne<{ session_version: number }>(
      `SELECT session_version FROM users WHERE id = $1`,
      [payload.userId]
    );
    if (!user) return null;

    const expectedVersion = user.session_version ?? 1;
    const tokenVersion = payload.sessionVersion ?? 1;
    if (tokenVersion !== expectedVersion) {
      return null;
    }

    if (payload.workspaceId) {
      const membership = await queryOne<{ role: string }>(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [payload.workspaceId, payload.userId]
      );
      if (!membership) {
        return null;
      }
    }

    return payload;
  } catch (err) {
    console.error('[validateSessionToken error]:', err);
    return null;
  }
}

export async function createUserWithWorkspace(params: {
  email: string;
  password: string;
  name?: string;
  workspaceName?: string;
}): Promise<{ user: User; workspace: Workspace; token: string }> {
  const { email, password, name, workspaceName } = params;
  const passwordHash = hashPassword(password);

  // 1. Create User
  const user = await queryOne<User>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING id, email, name, session_version, created_at`,
    [email.toLowerCase().trim(), passwordHash, name || null]
  );

  if (!user) {
    throw new Error('Failed to create user');
  }

  // 2. Create Workspace
  const wName = workspaceName || `${user.name || user.email.split('@')[0]}'s Workspace`;
  const defaultPlan = process.env.DEFAULT_WORKSPACE_PLAN || 'operator';
  const workspace = await queryOne<Workspace>(
    `INSERT INTO workspaces (name, plan)
     VALUES ($1, $2)
     RETURNING id, name, plan, created_at`,
    [wName, defaultPlan]
  );

  if (!workspace) {
    throw new Error('Failed to create workspace');
  }

  // 3. Create Workspace Member (role = 'owner')
  await query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [workspace.id, user.id]
  );

  workspace.role = 'owner';

  // 4. Generate Session Token (valid for 30 days)
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const token = signToken({
    userId: user.id,
    workspaceId: workspace.id,
    email: user.email,
    role: 'owner',
    sessionVersion: user.session_version ?? 1,
    exp,
  });

  return { user, workspace, token };
}

export async function authenticateUser(email: string, password: string): Promise<{
  user: User;
  workspace: Workspace;
  token: string;
} | null> {
  const row = await queryOne<{
    id: string;
    email: string;
    name: string | null;
    password_hash: string;
    session_version: number;
    created_at: string;
  }>(`SELECT id, email, name, password_hash, session_version, created_at FROM users WHERE email = $1`, [
    email.toLowerCase().trim(),
  ]);

  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;

  // Retrieve user's primary workspace
  const memberRow = await queryOne<{
    workspace_id: string;
    name: string;
    plan: string;
    role: string;
    created_at: string;
  }>(
    `SELECT w.id as workspace_id, w.name, w.plan, wm.role, w.created_at
     FROM workspace_members wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1
     ORDER BY (wm.role = 'owner') DESC, w.created_at ASC
     LIMIT 1`,
    [row.id]
  );

  if (!memberRow) {
    throw new Error('User has no workspace assigned');
  }

  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const token = signToken({
    userId: row.id,
    workspaceId: memberRow.workspace_id,
    email: row.email,
    role: memberRow.role,
    sessionVersion: row.session_version ?? 1,
    exp,
  });

  return {
    user: { id: row.id, email: row.email, name: row.name, session_version: row.session_version, created_at: row.created_at },
    workspace: {
      id: memberRow.workspace_id,
      name: memberRow.name,
      plan: memberRow.plan,
      role: memberRow.role,
      created_at: memberRow.created_at,
    },
    token,
  };
}

export async function findOrCreateGoogleUser(params: {
  email: string;
  name?: string;
  googleId?: string;
}): Promise<{ user: User; workspace: Workspace; token: string }> {
  const email = params.email.toLowerCase().trim();
  const name = params.name || null;

  // 1. Check if user already exists
  let user = await queryOne<User>(
    `SELECT id, email, name, session_version, created_at FROM users WHERE email = $1`,
    [email]
  );

  let workspace: Workspace | null = null;

  if (user) {
    // Existing user: retrieve their primary workspace
    const memberRow = await queryOne<{
      workspace_id: string;
      name: string;
      plan: string;
      role: string;
      created_at: string;
    }>(
      `SELECT w.id as workspace_id, w.name, w.plan, wm.role, w.created_at
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY (wm.role = 'owner') DESC, w.created_at ASC
       LIMIT 1`,
      [user.id]
    );

    if (memberRow) {
      workspace = {
        id: memberRow.workspace_id,
        name: memberRow.name,
        plan: memberRow.plan,
        role: memberRow.role,
        created_at: memberRow.created_at,
      };
    } else {
      // User exists but has no workspace: create one
      const wName = `${user.name || user.email.split('@')[0]}'s Workspace`;
      const defaultPlan = process.env.DEFAULT_WORKSPACE_PLAN || 'operator';
      const createdWs = await queryOne<Workspace>(
        `INSERT INTO workspaces (name, plan) VALUES ($1, $2) RETURNING id, name, plan, created_at`,
        [wName, defaultPlan]
      );
      if (!createdWs) throw new Error('Failed to create workspace for user');
      await query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [createdWs.id, user.id]
      );
      createdWs.role = 'owner';
      workspace = createdWs;
    }
  } else {
    // 2. Create new user
    const dummyPasswordHash = hashPassword('google_oauth_' + crypto.randomUUID());
    user = await queryOne<User>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, session_version, created_at`,
      [email, dummyPasswordHash, name]
    );
    if (!user) throw new Error('Failed to create Google user');

    // 3. Create initial workspace
    const wName = `${name || email.split('@')[0]}'s Workspace`;
    const defaultPlan = process.env.DEFAULT_WORKSPACE_PLAN || 'operator';
    const createdWs = await queryOne<Workspace>(
      `INSERT INTO workspaces (name, plan) VALUES ($1, $2) RETURNING id, name, plan, created_at`,
      [wName, defaultPlan]
    );
    if (!createdWs) throw new Error('Failed to create workspace');
    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [createdWs.id, user.id]
    );
    createdWs.role = 'owner';
    workspace = createdWs;
  }

  // 4. Generate 30-day session token
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const token = signToken({
    userId: user.id,
    workspaceId: workspace.id,
    email: user.email,
    role: workspace.role || 'owner',
    sessionVersion: user.session_version ?? 1,
    exp,
  });

  return { user, workspace, token };
}

export interface RequestWithCookies {
  cookies: {
    get: (name: string) => { value: string } | undefined;
  };
}

/**
 * Resolves the authenticated session from request cookies.
 * Verifies HMAC signature, checks expiration, and validates sessionVersion against the DB.
 * If fallbackToDefault is true and no valid token is present, resolves the default workspace
 * (used for guest / demo exploration mode).
 */
export async function getAuthSession(
  req: RequestWithCookies,
  _fallbackToDefault = false
): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    return await validateSessionToken(token);
  }

  return null;
}

export { COOKIE_NAME };
