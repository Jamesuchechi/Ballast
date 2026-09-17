import { query, queryOne, withTransaction } from '@/db/client';
import type { CitationRecord, ConflictResolutionMemory, ConflictResolutionStatus } from './types';

export interface ResolveConflictParams {
  workspaceId: string;
  citationId: string;
  resolutionType: 'confirmed_accurate' | 'dismissed' | 'superseded';
  userNote?: string;
  userId?: string;
  topic?: string;
}

export interface ResolveConflictResult {
  success: boolean;
  citation: CitationRecord;
  resolutionId: string;
}

/**
 * Resolves a conflict citation by marking it as confirmed accurate, dismissed, or superseded (Feature E9).
 * Records an immutable workspace-level conflict resolution entry so future scheduled runs know the authoritative source.
 */
export async function resolveConflictCitation(
  params: ResolveConflictParams
): Promise<ResolveConflictResult> {
  const { workspaceId, citationId, resolutionType, userNote, userId, topic: customTopic } = params;

  // 1. Fetch citation and enforce workspace boundary
  const citationRow = await queryOne<CitationRecord & { brief_id: string }>(
    `SELECT * FROM citations WHERE id = $1 AND workspace_id = $2`,
    [citationId, workspaceId]
  );

  if (!citationRow) {
    throw new Error(`Citation ${citationId} not found or does not belong to workspace`);
  }

  const resolvedAt = new Date().toISOString();
  const resolutionStatus: ConflictResolutionStatus = resolutionType;

  return await withTransaction(async (txClient) => {
    // 2. Update citation resolution fields
    const updatedCitationRes = await txClient.query(
      `UPDATE citations 
       SET resolution_status = $1,
           resolved_at = $2,
           resolved_by = $3,
           resolution_note = $4
       WHERE id = $5 AND workspace_id = $6
       RETURNING *`,
      [resolutionStatus, resolvedAt, userId || null, userNote || null, citationId, workspaceId]
    );

    const updatedCitation = updatedCitationRes.rows[0];

    // Determine representative topic from customTopic or citation quote snippet
    const inferredTopic = customTopic || `Discrepancy: ${citationRow.quote.slice(0, 80).replace(/\s+/g, ' ')}`;

    // 3. Insert into conflict_resolutions table for persistent memory
    const resolutionInsertRes = await txClient.query(
      `INSERT INTO conflict_resolutions (
        workspace_id,
        brief_id,
        citation_id,
        source_id,
        topic,
        resolution_type,
        user_note,
        resolved_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        workspaceId,
        citationRow.brief_id || null,
        citationId,
        citationRow.source_id || null,
        inferredTopic,
        resolutionType,
        userNote || null,
        userId || null,
      ]
    );

    const resolutionId = resolutionInsertRes.rows[0].id;

    // 4. Log in access_logs for complete auditing (NFR2.1)
    await txClient.query(
      `INSERT INTO access_logs (
        workspace_id, source_id, brief_id, action
      ) VALUES ($1, $2, $3, $4)`,
      [
        workspaceId,
        citationRow.source_id || null,
        citationRow.brief_id || null,
        `conflict_resolved:${resolutionType}`,
      ]
    );

    return {
      success: true,
      citation: updatedCitation,
      resolutionId,
    };
  });
}

/**
 * Retrieves active confirmed conflict resolutions for a workspace.
 * Fed back as grounding memory into subsequent and scheduled brief runs.
 */
export async function getWorkspaceConflictMemory(
  workspaceId: string,
  limit = 25
): Promise<ConflictResolutionMemory[]> {
  const rows = await query<any>(
    `SELECT 
      cr.id,
      cr.workspace_id,
      cr.brief_id,
      cr.citation_id,
      cr.source_id,
      cr.topic,
      cr.resolution_type,
      cr.user_note,
      cr.created_at,
      c.quote,
      s.connector
     FROM conflict_resolutions cr
     LEFT JOIN citations c ON c.id = cr.citation_id
     LEFT JOIN sources s ON s.id = cr.source_id
     WHERE cr.workspace_id = $1 AND cr.resolution_type = 'confirmed_accurate'
     ORDER BY cr.created_at DESC
     LIMIT $2`,
    [workspaceId, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    workspace_id: r.workspace_id,
    brief_id: r.brief_id,
    citation_id: r.citation_id,
    source_id: r.source_id,
    topic: r.topic,
    resolution_type: r.resolution_type,
    user_note: r.user_note,
    quote: r.quote,
    connector: r.connector,
    created_at: r.created_at,
  }));
}

/**
 * Retrieves all conflict citations and their resolution states for a given brief.
 */
export async function getBriefConflicts(
  briefId: string,
  workspaceId: string
): Promise<CitationRecord[]> {
  const rows = await query<CitationRecord>(
    `SELECT * FROM citations 
     WHERE brief_id = $1 AND workspace_id = $2 AND citation_type = 'conflict'
     ORDER BY created_at ASC`,
    [briefId, workspaceId]
  );
  return rows;
}
