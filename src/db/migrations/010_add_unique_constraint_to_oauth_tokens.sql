-- Migration: 010_add_unique_constraint_to_oauth_tokens.sql
-- Enforces a unique partial index on oauth_tokens(workspace_id, connector) for active (non-revoked) tokens.

-- Clean up any legacy duplicates by keeping the most recent active token row
DELETE FROM oauth_tokens
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY workspace_id, connector
             ORDER BY created_at DESC, id DESC
           ) as rn
    FROM oauth_tokens
    WHERE revoked_at IS NULL
  ) t
  WHERE t.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_workspace_connector_active
ON oauth_tokens(workspace_id, connector)
WHERE revoked_at IS NULL;
