-- Migration: 015_add_conflict_resolutions.sql
-- Description: Add conflict resolution tracking to citations and conflict_resolutions table (Feature E9)

ALTER TABLE citations ADD COLUMN IF NOT EXISTS resolution_status TEXT NOT NULL DEFAULT 'unresolved';
ALTER TABLE citations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE citations ADD COLUMN IF NOT EXISTS resolution_note TEXT;

CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brief_id UUID REFERENCES briefs(id) ON DELETE CASCADE,
  citation_id UUID REFERENCES citations(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  resolution_type TEXT NOT NULL CHECK (resolution_type IN ('confirmed_accurate', 'dismissed', 'superseded')),
  user_note TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_workspace ON conflict_resolutions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conflict_resolutions_citation ON conflict_resolutions(citation_id);
CREATE INDEX IF NOT EXISTS idx_citations_resolution ON citations(brief_id, resolution_status);
