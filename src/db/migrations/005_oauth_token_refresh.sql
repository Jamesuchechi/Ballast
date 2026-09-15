-- Migration 005: Add OAuth token refresh and reconnect tracking columns
ALTER TABLE oauth_tokens 
ADD COLUMN IF NOT EXISTS requires_reconnect BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_refresh_error TEXT;
