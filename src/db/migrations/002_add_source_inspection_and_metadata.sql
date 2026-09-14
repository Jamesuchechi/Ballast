-- Migration 002: Add Source Inspection Columns and Metadata
-- Ensures sources table has full inspection and synchronization tracking fields
ALTER TABLE sources ADD COLUMN IF NOT EXISTS sync_window_start TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS raw_uri TEXT;

-- Workspace metadata column
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Schedule name column
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS name TEXT;

-- Flags evaluation columns
ALTER TABLE flags ADD COLUMN IF NOT EXISTS claim_text TEXT;
ALTER TABLE flags ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
