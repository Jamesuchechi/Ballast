import { query, queryOne } from '@/db/client';
import { deleteSource } from './deletion';

export interface RetentionPolicy {
  connector: string;
  name: string;
  windowDays: number;
  description: string;
  sourceCount: number;
  oldestSourceDate: string | null;
}

export const DEFAULT_RETENTION_CONFIG: Record<
  string,
  { name: string; defaultDays: number; description: string }
> = {
  gmail: {
    name: 'Gmail Inbox',
    defaultDays: 90,
    description: 'Read-only email threads; default 90-day sync window (FR2.1, NFR2.1).',
  },
  github: {
    name: 'GitHub PRs & Discussions',
    defaultDays: 30,
    description: 'Pull requests, issues, and code reviews; 30-day activity window.',
  },
  slack: {
    name: 'Slack Conversations',
    defaultDays: 30,
    description: 'Channel messages and thread discussions; 30-day rolling window.',
  },
  notion: {
    name: 'Notion Workspace',
    defaultDays: 90,
    description: 'Documentation pages and engineering specifications; 90-day window.',
  },
  drive: {
    name: 'Google Drive',
    defaultDays: 90,
    description: 'Shared docs and design presentations; 90-day sync window.',
  },
  calendar: {
    name: 'Google Calendar',
    defaultDays: 14,
    description: 'Upcoming and past meetings; 14-day window.',
  },
  upload: {
    name: 'Uploaded Files & Pastes',
    defaultDays: 365,
    description: 'Direct PDF, CSV, and markdown uploads; default 365-day retention.',
  },
  web: {
    name: 'Web Citations (World Mode)',
    defaultDays: 7,
    description: 'External search snapshots; ephemeral 7-day cache.',
  },
};

/**
 * Retrieves per-source-type retention controls and statistics for a workspace (NFR2.1).
 */
export async function getRetentionPolicies(workspaceId: string): Promise<RetentionPolicy[]> {
  // Query per-connector counts and oldest source dates
  const stats = await query<{
    connector: string;
    count: string;
    oldest_date: string | null;
  }>(
    `SELECT 
       connector, 
       COUNT(id)::text as count, 
       MIN(created_at)::text as oldest_date
     FROM sources 
     WHERE workspace_id = $1
     GROUP BY connector`,
    [workspaceId]
  );

  const statsMap = new Map(
    stats.map((s) => [s.connector, { count: parseInt(s.count, 10), oldest: s.oldest_date }])
  );

  // Load custom workspace retention overrides stored in workspace meta
  const ws = await queryOne<{ meta?: any }>(
    `SELECT meta FROM workspaces WHERE id = $1`,
    [workspaceId]
  );

  const overrides: Record<string, number> = ws?.meta?.retention_windows || {};

  const policies: RetentionPolicy[] = Object.entries(DEFAULT_RETENTION_CONFIG).map(
    ([connector, config]) => {
      const stat = statsMap.get(connector);
      const configuredDays = overrides[connector] ?? config.defaultDays;

      return {
        connector,
        name: config.name,
        windowDays: configuredDays,
        description: config.description,
        sourceCount: stat?.count || 0,
        oldestSourceDate: stat?.oldest || null,
      };
    }
  );

  return policies;
}

/**
 * Updates retention window for a given source type.
 */
export async function updateRetentionPolicy(
  workspaceId: string,
  connector: string,
  windowDays: number
): Promise<void> {
  if (windowDays < 1 || windowDays > 3650) {
    throw new Error('Retention window must be between 1 and 3650 days');
  }

  // Persist into workspace meta JSONB
  await query(
    `UPDATE workspaces 
     SET meta = jsonb_set(
       COALESCE(meta, '{}'::jsonb),
       '{retention_windows}',
       COALESCE(meta->'retention_windows', '{}'::jsonb) || jsonb_build_object($2::text, $3::int),
       true
     )
     WHERE id = $1`,
    [workspaceId, connector, windowDays]
  );

  // Also log into access_logs
  await query(
    `INSERT INTO access_logs (workspace_id, action)
     VALUES ($1, $2)`,
    [workspaceId, `retention_policy_updated:${connector}:${windowDays}d`]
  );
}

/**
 * Prunes expired sources older than their retention window (NFR2.1).
 * Cascades to chunks, embeddings, and object storage bytes.
 */
export async function pruneExpiredSources(
  workspaceId: string,
  targetConnector?: string
): Promise<{ prunedCount: number; prunedSourceIds: string[] }> {
  const policies = await getRetentionPolicies(workspaceId);
  const relevantPolicies = targetConnector
    ? policies.filter((p) => p.connector === targetConnector)
    : policies;

  const prunedSourceIds: string[] = [];

  for (const policy of relevantPolicies) {
    // Find sources older than windowDays
    const expiredSources = await query<{ id: string }>(
      `SELECT id FROM sources 
       WHERE workspace_id = $1 
         AND connector = $2 
         AND created_at < NOW() - ($3::int * INTERVAL '1 day')`,
      [workspaceId, policy.connector, policy.windowDays]
    );

    for (const row of expiredSources) {
      const res = await deleteSource(workspaceId, row.id);
      if (res.success) {
        prunedSourceIds.push(row.id);
      }
    }
  }

  if (prunedSourceIds.length > 0) {
    await query(
      `INSERT INTO access_logs (workspace_id, action)
       VALUES ($1, $2)`,
      [workspaceId, `retention_pruned:${prunedSourceIds.length}_sources`]
    );
  }

  return {
    prunedCount: prunedSourceIds.length,
    prunedSourceIds,
  };
}
