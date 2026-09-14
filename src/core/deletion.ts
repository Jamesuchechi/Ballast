import { query, queryOne } from '@/db/client';
import { objectStore } from '@/storage/objectStore';
import { revokeToken } from '@/connectors/tokenStore';

export interface WorkspaceExportData {
  exportedAt: string;
  workspace: {
    id: string;
    name: string;
    plan: string;
    createdAt: string;
  };
  briefs: any[];
  sources: any[];
  actions: any[];
  schedules: any[];
  accessLogsSummary: {
    totalLogs: number;
    actionsCovered: string[];
  };
}

/**
 * Deletes a single source, purging its chunks, vector embeddings,
 * associated physical storage payloads, and citations (NFR2.2).
 */
export async function deleteSource(
  workspaceId: string,
  sourceId: string
): Promise<{ success: boolean; deletedChunks: number }> {
  // 1. Fetch source details before deletion to locate any raw storage files
  const source = await queryOne<{
    id: string;
    raw_uri: string | null;
    connector: string;
    external_id: string;
  }>(
    `SELECT id, raw_uri, connector, external_id FROM sources WHERE id = $1 AND workspace_id = $2`,
    [sourceId, workspaceId]
  );

  if (!source) {
    return { success: false, deletedChunks: 0 };
  }

  // 2. Count chunks to report
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM chunks WHERE source_id = $1`,
    [sourceId]
  );
  const deletedChunks = parseInt(countRow?.count || '0', 10);

  // 3. Delete physical object store bytes if raw_uri exists
  if (source.raw_uri) {
    await objectStore.delete(source.raw_uri);
  }

  // Also clean any workspace-specific storage path for this source
  const sourceStorageKey = `${workspaceId}/${source.external_id}`;
  await objectStore.delete(sourceStorageKey);

  // 4. Delete DB source row (PostgreSQL CASCADE removes chunks and vector embeddings)
  await query(`DELETE FROM sources WHERE id = $1 AND workspace_id = $2`, [
    sourceId,
    workspaceId,
  ]);

  // 5. Log deletion in access_logs for auditability
  await query(
    `INSERT INTO access_logs (workspace_id, action)
     VALUES ($1, $2)`,
    [workspaceId, `source_deleted:${source.connector}:${source.external_id}`]
  );

  return { success: true, deletedChunks };
}

/**
 * Wipes an entire connector's sources, embeddings, raw files, and revokes OAuth tokens.
 */
export async function deleteConnector(
  workspaceId: string,
  connector: string
): Promise<{ success: boolean; deletedSources: number }> {
  // 1. Fetch all sources for this connector
  const sources = await query<{ id: string; raw_uri: string | null; external_id: string }>(
    `SELECT id, raw_uri, external_id FROM sources WHERE workspace_id = $1 AND connector = $2`,
    [workspaceId, connector]
  );

  // 2. Clean physical object storage for each source
  for (const s of sources) {
    if (s.raw_uri) {
      await objectStore.delete(s.raw_uri);
    }
    await objectStore.delete(`${workspaceId}/${s.external_id}`);
  }

  // 3. Delete database records (cascades to chunks and embeddings)
  await query(`DELETE FROM sources WHERE workspace_id = $1 AND connector = $2`, [
    workspaceId,
    connector,
  ]);

  // 4. Revoke and delete OAuth token for connector
  await revokeToken(workspaceId, connector);
  await query(
    `DELETE FROM oauth_tokens WHERE workspace_id = $1 AND connector = $2`,
    [workspaceId, connector]
  );

  // 5. Log connector wipe in access_logs
  await query(
    `INSERT INTO access_logs (workspace_id, action)
     VALUES ($1, $2)`,
    [workspaceId, `connector_wiped:${connector}`]
  );

  return { success: true, deletedSources: sources.length };
}

/**
 * Pre-wipe export service (Closed decision #2: "wipe server-side artifacts; user must export first").
 * Compiles a structured, private export bundle of the workspace before irreversible wipe.
 */
export async function exportWorkspaceData(workspaceId: string): Promise<WorkspaceExportData> {
  const ws = await queryOne<any>(
    `SELECT id, name, plan, created_at FROM workspaces WHERE id = $1`,
    [workspaceId]
  );

  if (!ws) {
    throw new Error('Workspace not found');
  }

  const briefs = await query(
    `SELECT id, question, mode, status, markdown, as_of, created_at, published_at, error
     FROM briefs WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId]
  );

  const sources = await query(
    `SELECT id, connector, external_id, checksum, trust_boundary, synced_at, created_at, meta
     FROM sources WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId]
  );

  const actions = await query(
    `SELECT id, brief_id, type, payload, approved_at, executed_at, error, created_at
     FROM actions WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId]
  );

  const schedules = await query(
    `SELECT id, name, cron, question_template, mode, enabled, created_at
     FROM schedules WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId]
  );

  const logs = await query<{ action: string }>(
    `SELECT DISTINCT action FROM access_logs WHERE workspace_id = $1`,
    [workspaceId]
  );

  const countLogs = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM access_logs WHERE workspace_id = $1`,
    [workspaceId]
  );

  return {
    exportedAt: new Date().toISOString(),
    workspace: {
      id: ws.id,
      name: ws.name,
      plan: ws.plan,
      createdAt: ws.created_at,
    },
    briefs,
    sources,
    actions,
    schedules,
    accessLogsSummary: {
      totalLogs: parseInt(countLogs?.count || '0', 10),
      actionsCovered: logs.map((l) => l.action),
    },
  };
}

/**
 * Executes a full account/workspace wipe (NFR2.2, Closed Decision #2).
 * Irreversibly purges:
 * - Chunks & vector embeddings
 * - Synced sources & raw payloads
 * - Briefs, citations, actions, runs, and schedules (no retained briefs)
 * - OAuth tokens & secrets
 * - Notifications & access logs
 * - Physical object store bytes on disk (`.storage/<workspace_id>/`)
 */
export async function wipeWorkspaceAccount(workspaceId: string): Promise<{
  success: boolean;
  purgedFilesCount: number;
}> {
  // 1. Purge all physical disk files belonging to workspace
  const purgedFilesCount = await objectStore.deletePrefix(workspaceId);

  // 2. Cascade delete database records in proper dependency order
  await query(`DELETE FROM access_logs WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM notifications WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM oauth_tokens WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM runs WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM actions WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM citations WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM briefs WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM schedules WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM chunks WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM sources WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM workspace_members WHERE workspace_id = $1`, [workspaceId]);
  await query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);

  return { success: true, purgedFilesCount };
}
