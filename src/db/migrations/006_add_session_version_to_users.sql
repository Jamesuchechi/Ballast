-- Migration 006: Add session_version to users for server-side session invalidation (Bug 6)
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
