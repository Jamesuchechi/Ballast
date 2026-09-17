-- Migration 008: Add index on chunks(source_id) for fast cascade deletes & source chunk lookup
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);
