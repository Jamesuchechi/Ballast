import crypto from 'crypto';
import { query, queryOne } from '@/db/client';

const SESSION_SECRET = process.env.SESSION_SECRET || 'ballast_super_secret_session_key_for_dev_32b';
const COOKIE_NAME = 'ballast_session';

export interface User {
  id: string;
  email: string;
  name: string | null;
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
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
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
     RETURNING id, email, name, created_at`,
    [email.toLowerCase().trim(), passwordHash, name || null]
  );

  if (!user) {
    throw new Error('Failed to create user');
  }

  // 2. Create Workspace
  const wName = workspaceName || `${user.name || user.email.split('@')[0]}'s Workspace`;
  const workspace = await queryOne<Workspace>(
    `INSERT INTO workspaces (name, plan)
     VALUES ($1, 'free')
     RETURNING id, name, plan, created_at`,
    [wName]
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
    created_at: string;
  }>(`SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1`, [
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
    exp,
  });

  return {
    user: { id: row.id, email: row.email, name: row.name, created_at: row.created_at },
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

export interface RequestWithCookies {
  cookies: {
    get: (name: string) => { value: string } | undefined;
  };
}

/**
 * Resolves the authenticated session from request cookies.
 * Verifies HMAC signature, checks expiration, and returns verified SessionPayload.
 * If fallbackToDefault is true and no valid token is present, resolves the default workspace
 * (used for guest / demo exploration mode).
 */
export async function getAuthSession(
  req: RequestWithCookies,
  fallbackToDefault = false
): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      return payload;
    }
  }

  if (fallbackToDefault) {
    const defaultWs = await queryOne<{ id: string }>(
      `SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1`
    );
    if (defaultWs) {
      return {
        userId: '00000000-0000-0000-0000-000000000000',
        workspaceId: defaultWs.id,
        email: 'guest@ballast.local',
        role: 'member',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
    }
  }

  return null;
}

export { COOKIE_NAME };
