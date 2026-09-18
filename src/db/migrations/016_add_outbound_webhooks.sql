-- Migration: 016_add_outbound_webhooks.sql
-- Description: Add outbound webhooks table for external automation integrations (Feature E11)

CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['brief.published'],
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_status_code INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_workspace ON outbound_webhooks(workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_created ON outbound_webhooks(workspace_id, created_at DESC);
