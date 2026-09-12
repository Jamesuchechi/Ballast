-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS "vector";
  END IF;
END $$;

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'operator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. workspace_members
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- 4. sources
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connector TEXT NOT NULL CHECK (connector IN ('upload', 'gmail', 'github', 'calendar', 'web')),
  external_id TEXT NOT NULL,
  checksum TEXT NOT NULL,
  trust_boundary TEXT NOT NULL DEFAULT 'untrusted_content',
  sync_window_start TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ,
  last_error TEXT,
  raw_uri TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. chunks
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    CREATE TABLE IF NOT EXISTS chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      embedding vector(1536),
      ordinal INTEGER NOT NULL DEFAULT 0,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  ELSE
    CREATE TABLE IF NOT EXISTS chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      embedding TEXT,
      ordinal INTEGER NOT NULL DEFAULT 0,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- 6. briefs
CREATE TABLE IF NOT EXISTS briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'home' CHECK (mode IN ('home', 'world')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'needs_review', 'published', 'failed')),
  markdown TEXT,
  pdf_uri TEXT,
  as_of TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale_after TIMESTAMPTZ,
  progress JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule_id UUID,
  published_at TIMESTAMPTZ,
  error TEXT,
  template_version TEXT NOT NULL DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. citations
CREATE TABLE IF NOT EXISTS citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  source_class TEXT NOT NULL CHECK (source_class IN ('private', 'web', 'system')),
  citation_type TEXT NOT NULL CHECK (citation_type IN ('support', 'conflict', 'missing', 'unchecked')),
  claim_span JSONB NOT NULL,
  quote TEXT NOT NULL,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. actions
CREATE TABLE IF NOT EXISTS actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('email_draft', 'issue_draft', 'comment_draft', 'task')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. runs
CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  tools_called JSONB NOT NULL DEFAULT '[]'::jsonb,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
  critic_log JSONB NOT NULL DEFAULT '{}'::jsonb,
  circuit_broken BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. schedules
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  cron TEXT NOT NULL,
  question_template TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'home' CHECK (mode IN ('home', 'world')),
  last_run_brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS name TEXT;

-- Foreign key for briefs.schedule_id now that schedules exists
ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_schedule_id_fkey;
ALTER TABLE briefs ADD CONSTRAINT briefs_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL;

-- 11. flags
CREATE TABLE IF NOT EXISTS flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brief_id UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  citation_id UUID REFERENCES citations(id) ON DELETE SET NULL,
  claim_span JSONB,
  claim_text TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('wrong', 'unsupported')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE flags ADD COLUMN IF NOT EXISTS claim_text TEXT;
ALTER TABLE flags ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

-- 12. access_logs
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. oauth_tokens
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connector TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance & workspace boundary enforcement
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_workspace ON sources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_briefs_workspace ON briefs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_briefs_parent ON briefs(parent_brief_id);
CREATE INDEX IF NOT EXISTS idx_citations_brief ON citations(brief_id);
CREATE INDEX IF NOT EXISTS idx_actions_brief ON actions(brief_id);
CREATE INDEX IF NOT EXISTS idx_runs_brief ON runs(brief_id);
