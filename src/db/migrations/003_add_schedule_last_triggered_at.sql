-- Migration 003: Add Schedule Last Triggered At for Worker Cron Engine
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;

-- Index to optimize finding due schedules in the background worker
CREATE INDEX IF NOT EXISTS idx_schedules_enabled_trigger ON schedules(enabled, last_triggered_at);
