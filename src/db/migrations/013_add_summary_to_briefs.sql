-- Migration 013: Add summary (TL;DR) column to briefs table (Audit E1)
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS summary TEXT;
