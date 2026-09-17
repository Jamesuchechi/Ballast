-- Migration: 009_add_idx_access_logs.sql
-- Optimizes retention passes, audit log filtering, and source deletion/cascade operations on access_logs table.

CREATE INDEX IF NOT EXISTS idx_access_logs_action ON access_logs(action);
CREATE INDEX IF NOT EXISTS idx_access_logs_source ON access_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_workspace ON access_logs(workspace_id);
