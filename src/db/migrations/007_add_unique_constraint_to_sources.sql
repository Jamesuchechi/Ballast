-- 007_add_unique_constraint_to_sources.sql
-- Enforce unique constraint on (workspace_id, connector, external_id) across all indexed sources

-- 1. Deduplicate any existing duplicate sources keeping the most recent one
DELETE FROM sources s1
USING sources s2
WHERE s1.workspace_id = s2.workspace_id
  AND s1.connector = s2.connector
  AND s1.external_id = s2.external_id
  AND (s1.created_at < s2.created_at OR (s1.created_at = s2.created_at AND s1.id < s2.id));

-- 2. Create unique index on (workspace_id, connector, external_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_workspace_connector_external
ON sources (workspace_id, connector, external_id);
