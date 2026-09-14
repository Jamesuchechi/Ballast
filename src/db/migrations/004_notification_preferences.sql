-- Migration 004: Add notification_preferences column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{"email_enabled": true, "notify_on_publish": true, "notify_on_fail": true}'::jsonb;
