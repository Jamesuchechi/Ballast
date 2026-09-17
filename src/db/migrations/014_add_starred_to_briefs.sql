-- Migration: 014_add_starred_to_briefs.sql
-- Description: Add starred boolean and index to briefs for bookmarks (Feature E7)

ALTER TABLE briefs ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_briefs_starred ON briefs(workspace_id, starred);
