-- Migration 012: Add read_at and dismissed_at timestamps to notifications (Audit M7)

ALTER TABLE notifications 
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

-- Backfill existing read notifications with created_at as initial read_at
UPDATE notifications 
SET read_at = created_at 
WHERE read = true AND read_at IS NULL;

-- Index for active (undismissed) notifications filtering
CREATE INDEX IF NOT EXISTS idx_notifications_active 
  ON notifications(workspace_id, created_at DESC) 
  WHERE dismissed_at IS NULL;
