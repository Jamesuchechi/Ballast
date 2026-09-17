# Ballast — Full Codebase Audit Report
**Date:** 2026-09-16 | **Auditor:** Antigravity (Claude Sonnet 4.6 Thinking)

---

## 🗺️ Project Overview

Ballast is a **grounded briefing OS** — a private intelligence layer that synthesizes documents from connected private sources (Gmail, GitHub, Drive, Slack, Notion, Calendar) into citation-gated, verifiable briefs. It has a Writer → Critic → Validator pipeline that is architecturally sound and unusual in the AI tool space.

**Stack:** Next.js 16, PostgreSQL + pgvector, BullMQ + Redis, S3/R2, Resend email, multi-provider LLM fallback (Gemini → Groq → Mistral → OpenRouter).

**Phases complete:** 0–9 (all phases done. Phase 10 — Billing — intentionally deferred).

---

## ✅ What's Working Well (Genuine Strengths)

### Architecture
- **Writer/Critic separation** is genuinely excellent. The Critic never trusts the Writer's output — it re-validates against the raw retrieved quotes independently. This is the core value prop and it's correct.
- **Fail-closed everywhere.** `pipelineWorker.ts` correctly sets `status='failed'` on any uncaught error. The validator blocks `published` if the Critic schema is invalid. `briefSeed.ts` guard (`assertDevOrTestFixture()`) prevents test data leaking into production.
- **Citation-gated action filtering** — actions derived from dropped/injected claims are silently refused and logged to `did_not`. This is subtle but important.
- **Multi-tier LLM fallback** (`llm.ts`) with exponential backoff, role-based model dispatch (writer vs critic), and a sensible 4-provider chain is production-grade.
- **Multi-tier embedding fallback** — Gemini → Mistral → local BallastLocalEmbedding. Having an offline fallback that still *works* (not just crashes) is a big deal.
- **AES-256-GCM everywhere** — object store, OAuth token store, both use proper IV + auth tag envelopes. The `BALLAST_ENC_V1:` magic header for envelope detection in `objectStore.ts` is clean.
- **Workspace isolation at SQL level** — `WHERE workspace_id = $1` appears in every query that touches user data. Private chunks filter `connector != 'web'`; web chunks filter `connector = 'web'`. This is enforced in data, not by convention.
- **Advisory lock in retention** (`pg_try_advisory_lock`) prevents double-runs across worker instances. Rare to see this done correctly.
- **Rate limiting with Redis fallback** — in-memory sliding window when Redis is unavailable. No hard crash.
- **Injection pattern list in `critic.ts`** — covers hidden HTML comments, PDF asides, system-override patterns, SQL injection, curl/wget patterns. Solid list for v1.
- **Conflict detection** is deterministic (date regex, price regex, status word regex) — works in test without an LLM. The LLM-based critic also handles conflicts independently.
- **Diff engine** (`diff.ts`) with version chain enforcement (`getRootBriefId` cycle detection, `areInSameVersionChain`) — prevents diffs across unrelated briefs.
- **Progress tracking** appended to JSONB (`||` concatenation) rather than overwriting — audit trail is preserved.
- **DB client** handles IPv4 DNS priority, `channel_binding` stripping, transient retry on `ETIMEDOUT`/`ECONNRESET`/`57P01`. These are real production gotchas.
- **Token refresh** auto-triggered when token is within 5-minute expiry buffer — smooth UX, no re-auth surprise mid-brief.

---

## 🐛 Bugs & Critical Gaps

### 1. `mistral-embed` padding is semantically wrong [RESOLVED]
**File:** [`embeddings.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/embeddings.ts#L170-L176)
Mistral's `mistral-embed` produces **1024-dimensional** vectors. You zero-pad them to 1536 dimensions. **Zero-padding is mathematically incorrect** — cosine similarity against Gemini-produced 1536-dim vectors will be unreliable because the two spaces are incompatible. Zero-padded vectors will always score lower similarity against real 1536-dim vectors. This means if you switch embedding providers mid-dataset, retrieval silently degrades.

**Resolution:** Removed the zero-padding hack and prohibited mixing incompatible dimension spaces. Configured Gemini as primary 1536-dim cloud provider, OpenAI/OpenRouter `text-embedding-3-small` as secondary 1536-dim provider, and Ballast Local Engine as offline 1536-dim resilient fallback. Incompatible 1024-dim Mistral configurations fail fast with clear actionable error messages. Updated `db:reembed.ts` to log the active provider and enforce dimension matching during chunk migration.

### 2. PDF text extraction is a stub [RESOLVED]
**File:** [`ingest.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/ingest.ts#L61-L75)
The PDF extraction regex `/([(][^)]+[)])\s*Tj/g` only works for uncompressed, non-stream PDF text objects. Modern PDFs (compressed, Type1 fonts, CIDFont) will silently return the fallback string `"[Document: filename] Text content extracted from PDF payload."` — meaning you'll index an empty placeholder instead of actual content. Users will get `No citable evidence found` when uploading PDFs.

**Resolution:** Integrated `pdf-parse` (`pdf-parse/lib/pdf-parse.js` to ensure robust Node/ESM compatibility). Extract real textual content from modern compressed PDFs with stream regex as a secondary fallback. Replaced silent placeholder indexing with fail-closed validation that rejects empty/unextractable PDFs. Added end-to-end PDF ingest test in `test/ingest_pdf.test.ts`.

### 3. Image files index a static string — not usable for retrieval [RESOLVED]
**File:** [`ingest.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/ingest.ts#L78-L80)
`.png`, `.jpg`, `.jpeg` files are stored with the text `"[Image Asset: filename] Image source metadata embedded for reference."` — this will never contribute to any useful retrieval. It's a placeholder that was never completed.

**Resolution:** Replaced the static placeholder with Gemini Multimodal Vision extraction (`gemini-3.6-flash` / `gemini-3.5-flash` / `gemini-flash-latest`) in `extractTextFromImage`. Automatically transcribes visible text, tables, numbers, and diagrams into indexed structured text. Added fail-closed enforcement requiring `GEMINI_API_KEY` for image uploads rather than polluting the database with dead placeholders. Created unit test suite in `test/ingest_image.test.ts`.

### 4. Tokens in `runs` table are not real token counts [RESOLVED]
**File:** [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts#L508-L509)
Character-based heuristic estimates (`question.length * 3 + 450` and `markdown.length`) were previously written to `tokens_in` and `tokens_out` in the `runs` table.

**Resolution:** Updated `llm.ts` to extract actual token metrics from LLM responses (`usageMetadata.promptTokenCount` / `candidatesTokenCount` from Gemini, and `usage.prompt_tokens` / `completion_tokens` from OpenAI-compatible providers: Groq, Mistral, OpenRouter). Added `onUsage` callback support to `LLMCallOptions` and exported `llmCallWithUsage`. In `pipelineWorker.ts`, real token usage is accumulated across Writer and Critic stages and persisted accurately to the `runs` table. Added unit test in `test/llm.test.ts`.

### 5. `retrieval.ts` has no similarity threshold [RESOLVED]
**File:** [`retrieval.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/retrieval.ts#L44-L60)
Vector retrieval previously ordered by cosine distance with no distance cutoff, potentially returning irrelevant chunks when no relevant material existed.

**Resolution:** Added `maxDistance` filtering (`(c.embedding <=> $1::vector) <= $3`) to both `retrievePrivateChunks` and `retrieveWebChunks` with `DEFAULT_MAX_DISTANCE = 0.85` (configurable via `options.maxDistance` or `RETRIEVAL_MAX_DISTANCE`). Updated `RetrievedQuote` to expose both `distance` and `similarity` (`1 - distance`) metadata on every retrieved quote. Added test suite in `test/retrieval_threshold.test.ts`.

### 6. Session token is a simple HMAC — no session invalidation [RESOLVED]
**File:** [`auth.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/auth.ts#L44-L105)
The session was previously a stateless `base64(payload).HMAC` token without session revocation capability.

**Resolution:** Added `session_version INTEGER NOT NULL DEFAULT 1` column to the `users` table via migration `006_add_session_version_to_users.sql` and updated `schema.sql`. Added `sessionVersion` into `SessionPayload` and `signToken`. Implemented `validateSessionToken(token)` and updated `getAuthSession(req)` to verify cryptographic signature, expiration, and DB `session_version` consistency. Exported `invalidateUserSessions(userId)` to bump `session_version`, instantly invalidating existing tokens. Integrated invalidation on password change in `/api/profile` and updated `/api/auth/me`. Added automated test suite in `test/session_invalidation.test.ts`.

### 7. `wipeWorkspaceAccount` does not invalidate open sessions [RESOLVED]
**File:** [`deletion.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/deletion.ts#L199-L235)
After account/workspace wipe, users previously possessed valid HMAC session cookies that were accepted by endpoints until the 30-day cookie expired.

**Resolution:** Updated `wipeWorkspaceAccount` in `src/core/deletion.ts` to locate all member users of the wiped workspace and call `invalidateUserSessions` for each, bumping their database `session_version` and immediately revoking active tokens across all devices. Orphaned user records with no remaining workspaces are permanently removed. Enhanced `validateSessionToken` in `src/lib/auth.ts` to verify active membership in `workspace_members(workspace_id, user_id)`. Upgraded all authenticated API routes (`briefs`, `actions`, `workspace/export`, `access-logs`, `notifications`, `schedules`, `analytics`, `telemetry`, `flags`, `metrics/latency`, `user/preferences`) from unvalidated token checks to `getAuthSession(req)`, ensuring requests against wiped workspaces or with revoked tokens are immediately rejected with 401 Unauthorized. Verified in `test/wipe_session_invalidation.test.ts` and `test/phase8_security_hardening.test.ts`.

### 8. Cost estimate baseline is hardcoded to `$0.0025` [RESOLVED]
**File:** [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts#L100), [`llm.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/llm.ts#L446-L516)
The pipeline previously started `totalCost` with a hardcoded `$0.0025` magic number, overstating run costs on free-tier and low-cost providers.

**Resolution:** Removed the hardcoded `$0.0025` baseline and initialized `totalCost = 0`. Implemented `estimateLLMCost(provider, model, promptTokens, completionTokens)` in `src/core/llm.ts` with comprehensive `MODEL_PRICING` tables across Gemini, Groq, Mistral, and OpenRouter (evaluating $0.00 on free-tier models and eval mocks). In `pipelineWorker.ts`, accumulated actual LLM token costs across Writer and Critic stages via `trackUsage(usage, meta)` and combined them with tool costs (e.g. web search), persisting real, high-precision costs to the `runs` table (`NUMERIC(10, 6)`). Added test suite in `test/cost_calculation.test.ts`.

### 9. `diff.ts` version chain length is always `2` [RESOLVED]
**File:** [`diff.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/diff.ts#L170-L245)
Previously, `versionChainLength` was hardcoded to `2` in `diffBriefsInChain`, regardless of how many generation steps separated two briefs or whether comparing identical briefs.

**Resolution:** Upgraded `areInSameVersionChain` and `diffBriefsInChain` in `src/core/diff.ts` to compute exact lineage distances and chain depths. It accurately tracks direct ancestor/descendant relationships (chain length = generation distance + 1, self = 1, parent-child = 2, 3-generation linear = 3) and computes lowest common ancestor (LCA) tree distances for branching lineages. Integrated `versionChainLength: chainCheck.chainLength` into `diffBriefsInChain`. Verified via unit tests in `test/diff_version_chain.test.ts` and `test/phase9_polish.test.ts`.

### 10. `computeLineDiff` diff algorithm is O(n²) worst-case [RESOLVED]
**File:** [`diff.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/diff.ts#L160-L190)
The greedy diff previously scanned forward using `oldLines.includes(newLines[j], i)` and `oldLines.indexOf(...)` in an inner loop, exhibiting $O(n^2)$ worst-case time complexity.

**Resolution:** Replaced the greedy quadratic search with an $O(ND)$ Myers diff algorithm using `diffLines` from the `diff` package. Updated `computeLineDiff` in `src/core/diff.ts` to transform Myers change hunks into normalized `DiffLine[]` structures with newline sanitation. Benchmarked and verified on 5,000-line documents (diff calculated in 41ms) via `test/diff_myers.test.ts` along with full regression verification in `test/diff_version_chain.test.ts` and `test/phase9_polish.test.ts`.

### 11. `SecretsManager.rotateToken` doesn't revoke the old token [RESOLVED]
**File:** [`secretsManager.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/secretsManager.ts#L68-L98)
Previously, `rotateToken` simply performed an in-place overwrite on the existing active token row, identical to `setToken`, without marking the previous token record as revoked or maintaining historical audit lineage.

**Resolution:** Updated `SecretsManager.rotateToken` in `src/core/secretsManager.ts` to explicitly call `revokeToken(workspaceId, connector)` on the existing active token record before provisioning the new encrypted credentials (preserving previous scopes if not explicitly overridden). This guarantees that previous credentials are explicitly marked revoked in `oauth_tokens` (`revoked_at = NOW()`), maintaining an immutable audit history while provisioning fresh active credentials. Verified with unit tests in `test/token_rotation.test.ts` and regression tests in `test/phase8_security_hardening.test.ts`.

### 12. The `openrouter` header `HTTP-Referer` is `https://ballast.local` [RESOLVED]
**File:** [`llm.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/llm.ts#L133-L175)
Previously, `callOpenAICompatible` for the `openrouter` provider used a hardcoded fallback of `https://ballast.local`, placing traffic in the untracked bucket and risking rate limit degradation.

**Resolution:** Implemented `getOpenRouterReferer()` in `src/core/llm.ts` to dynamically resolve the canonical application URL from environment variables (`NEXT_APP_URL`, `VERCEL_URL`, `APP_URL`) and default to the canonical production domain `https://ballast.app`. Verified via unit tests in `test/llm.test.ts`.

---

## 🔴 Security Concerns

### S1. Default encryption key is a hardcoded string [RESOLVED]
**Files:** [`tokenStore.ts`](file:///home/jamesuchechi/Projects/Ballast/src/connectors/tokenStore.ts#L4-L20), [`objectStore.ts`](file:///home/jamesuchechi/Projects/Ballast/src/storage/objectStore.ts#L22-L40)
Previously, both the OAuth token store and encrypted object store silently fell back to the hardcoded string `'ballast_default_aes_256_gcm_master_key_seed_2026'` when `BALLAST_ENCRYPTION_KEY` was missing, which risked encrypting data with a known-plaintext key in production without warning.

**Resolution:** Implemented `getEncryptionKey()` in both `src/connectors/tokenStore.ts` and `src/storage/objectStore.ts`. In production (`NODE_ENV=production`), missing encryption keys now throw a fatal exception (`[SECURITY FATAL] BALLAST_ENCRYPTION_KEY (or SESSION_SECRET) must be set in production mode. Hardcoded fallback keys are strictly prohibited.`) rather than silently falling back. Tested and verified via `test/security_encryption_key.test.ts` and `test/phase8_security_hardening.test.ts`.

### S2. Default session secret is a hardcoded string [RESOLVED]
**File:** [`auth.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/auth.ts#L4-L20)
Previously, `auth.ts` silently fell back to the hardcoded string `'ballast_super_secret_session_key_for_dev_32b'` when `SESSION_SECRET` was omitted, risking HMAC forgery in production if the secret was misconfigured.

**Resolution:** Implemented `getSessionSecret()` in `src/lib/auth.ts`. In production (`NODE_ENV=production`), missing `SESSION_SECRET` (or `BALLAST_ENCRYPTION_KEY`) throws a fatal error (`[SECURITY FATAL] SESSION_SECRET (or BALLAST_ENCRYPTION_KEY) must be set in production mode. Hardcoded fallback session secrets are strictly prohibited.`) rather than silently falling back. Updated `signToken` and `verifyToken` to use `getSessionSecret()`. Verified via `test/security_session_secret.test.ts` and `test/session_invalidation.test.ts`.

### S3. `rejectUnauthorized: false` in production [RESOLVED]
**File:** [`client.ts`](file:///home/jamesuchechi/Projects/Ballast/src/db/client.ts#L22-L65)
Previously, PostgreSQL connections defaulted to `{ rejectUnauthorized: false }`, disabling TLS certificate chain validation and leaving database network traffic vulnerable to MITM attacks.

**Resolution:** Implemented `getDatabaseSslConfig()` in `src/db/client.ts` to enforce strict TLS certificate validation (`rejectUnauthorized: true`) by default for SSL connections. Added support for custom CA certificates via `DATABASE_CA_CERT` or `PGSSLROOTCERT` (both raw PEM strings and file paths), while providing an explicit opt-out (`DB_SSL_REJECT_UNAUTHORIZED=false`) for self-signed local development. Verified against production Neon database and via unit test in `test/security_ssl_config.test.ts`.

### S4. Rate limiting is per-IP, easily bypassed [RESOLVED]
**File:** [`rateLimit.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/rateLimit.ts#L35-L85), [`login/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/auth/login/route.ts), [`signup/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/auth/signup/route.ts)
Previously, rate limiting relied strictly on raw `x-forwarded-for` strings without IP format validation or account-level compound protections, allowing malicious header spoofing or rotating IP credential stuffing attacks.

**Resolution:** Hardened `getClientIp` in `src/lib/rateLimit.ts` with strict proxy header precedence (`cf-connecting-ip` -> `x-vercel-forwarded-for` -> `x-real-ip` -> `x-forwarded-for`) and strict `net.isIP()` validation. Implemented `checkCompoundRateLimit` to evaluate multiple rate limit dimensions simultaneously. Updated sensitive authentication routes (`POST /api/auth/login` and `POST /api/auth/signup`) to enforce dual-layer rate limiting: per-IP (10 req/min) and per-target-account email (5 req/min). Verified via `test/security_rate_limit.test.ts`.

### S5. XSS risk in email template [RESOLVED]
**File:** [`emailService.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/emailService.ts#L97-L107)
User-controlled strings (`params.title`, `params.question`, `params.summaryOrError`, `params.viewUrl`) were interpolated directly into HTML without escaping.

**Fix:** Implemented `escapeHtml` in `src/core/emailService.ts` to sanitize special HTML characters (`&`, `<`, `>`, `"`, `'`). All user-controlled fields interpolated into email templates are passed through `escapeHtml()` prior to rendering. Verified via `test/security_email_xss.test.ts`.

### S6. `actions` table `type` constraint doesn't include all types used in code [RESOLVED]
**Schema:** The CHECK constraint in `actions` is `type IN ('email_draft', 'issue_draft', 'comment_draft', 'task')`. Verified against PostgreSQL database catalog and TypeScript definitions in [`src/core/actionExecutor.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/actionExecutor.ts) via `test/security_actions_type_constraint.test.ts`. ✓

---

## 🟡 Design Gaps & Technical Debt

### D1. `pipeline.ts` and `pipelineWorker.ts` are near-duplicates [RESOLVED]
**Files:** [`pipeline.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipeline.ts), [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts), [`assembler.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/assembler.ts)
`pipeline.ts` is the stateless eval pipeline and `pipelineWorker.ts` is the production queue/DB worker. Previously, both files maintained separate duplicated copies of brief assembly logic (answer construction, conflict surfacing, action sanitization, and publish validation).

**Resolution:** Extracted all shared brief assembly and validation logic into a pure, deterministic `assembleBrief(options)` module in `src/core/assembler.ts`. Refactored both `src/core/pipeline.ts` and `src/core/pipelineWorker.ts` to consume `assembleBrief`, eliminating code duplication while preserving exact schema validation and fail-closed safety. Verified with 100% pass rate in `test/brief_assembler.test.ts` and full eval scorecard suite.

### D2. All actions are inserted as `email_draft` regardless of content [RESOLVED]
**Files:** [`actionExecutor.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/actionExecutor.ts), [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts), [`writer.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/writer.ts)
Previously, the action type was hardcoded to `'email_draft'` for all proposed actions inserted during pipeline runs, causing in-app tasks, GitHub issue drafts, and comment drafts to be misclassified.

**Resolution:** Implemented `parseProposedAction(rawAction)` in `src/core/actionExecutor.ts` to parse, classify, and normalize proposed action strings (prefixed key-value tags, natural language patterns, and JSON objects) into `'email_draft' | 'issue_draft' | 'comment_draft' | 'task'` with structured payload attributes (`to`, `subject`, `body`, `repo`, `issue_number`, `title`, `summary`). Refactored `pipelineWorker.ts` to insert actions using `parsed.type` and `parsed.payload`. Updated `writer.ts` prompt guidelines for structured action generation. Verified with 100% pass rate in `test/action_routing.test.ts` and `test/action_execution.test.ts`.

### D3. `sources` table has a `UNIQUE` on `(workspace_id, connector, external_id)` [RESOLVED]
**Schema:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql), [`007_add_unique_constraint_to_sources.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/migrations/007_add_unique_constraint_to_sources.sql)
Previously, `sources` lacked a unique constraint on `(workspace_id, connector, external_id)`. Deduplication in `ingest.ts` and sync logic across connectors (Gmail, GitHub, Drive, Slack, Calendar, Notion, Web) was prone to race conditions and duplicate source records when re-syncing existing external IDs.

**Resolution:** Applied migration `007_add_unique_constraint_to_sources.sql` and updated `schema.sql` with `CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_workspace_connector_external ON sources(workspace_id, connector, external_id)`. Refactored all connectors (`gmail.ts`, `github.ts`, `drive.ts`, `calendar.ts`, `slack.ts`, `notion.ts`, `web.ts`) and `ingest.ts` to query sources by `(workspace_id, connector, external_id)`: if checksum is unchanged, only update `synced_at`; if content changed, update source metadata and checksum, delete obsolete chunks (`DELETE FROM chunks WHERE source_id = $id`), and re-embed fresh chunk vectors. Added comprehensive automated test suite in `test/source_deduplication.test.ts` (4/4 passed).

### D4. The `chunks` table has no index on `source_id` [RESOLVED]
**Schema:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql), [`008_add_idx_chunks_source.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/migrations/008_add_idx_chunks_source.sql)
Previously, `chunks` only possessed `idx_chunks_workspace`. Operations that deleted a source (`DELETE FROM chunks WHERE source_id = $1` on source re-sync or cascade delete) required sequential scans across all workspace chunk rows.

**Resolution:** Applied migration `008_add_idx_chunks_source.sql` and updated `schema.sql` with `CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id)`. Verified index definition in PostgreSQL catalog and fast source chunk lookup/deletion via automated test suite in `test/chunks_source_index.test.ts` (2/2 passed).

### D5. `access_logs` has no index on `action` or `source_id` [RESOLVED]
**Schema:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql), [`009_add_idx_access_logs.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/migrations/009_add_idx_access_logs.sql)
Previously, `access_logs` lacked indexes on `action`, `source_id`, and `workspace_id`. Periodic retention passes (`WHERE action LIKE 'retention_global_pass:%'`), access log audit views, and source deletion/cascade operations resulted in full sequential table scans.

**Resolution:** Applied migration `009_add_idx_access_logs.sql` and updated `schema.sql` with `CREATE INDEX IF NOT EXISTS idx_access_logs_action ON access_logs(action)`, `CREATE INDEX IF NOT EXISTS idx_access_logs_source ON access_logs(source_id)`, and `CREATE INDEX IF NOT EXISTS idx_access_logs_workspace ON access_logs(workspace_id)`. Verified index definitions in PostgreSQL catalog and retention query lookup via automated test suite in `test/access_logs_indexes.test.ts` (3/3 passed).

### D6. `oauth_tokens` has no UNIQUE constraint on `(workspace_id, connector)` [RESOLVED]
**Schema:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql), [`010_add_unique_constraint_to_oauth_tokens.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/migrations/010_add_unique_constraint_to_oauth_tokens.sql)
**File:** [`tokenStore.ts`](file:///home/jamesuchechi/Projects/Ballast/src/connectors/tokenStore.ts#L87-L115)
Previously, `oauth_tokens` lacked a unique constraint on active workspace connectors. Concurrent token store operations could produce duplicate active rows, and lookups had to rely on non-deterministic fallback ordering.

**Resolution:** Applied migration `010_add_unique_constraint_to_oauth_tokens.sql` creating partial unique index `idx_oauth_tokens_workspace_connector_active` on `(workspace_id, connector) WHERE revoked_at IS NULL`. Refactored `storeEncryptedToken` in `src/connectors/tokenStore.ts` to perform an atomic PostgreSQL upsert using `ON CONFLICT (workspace_id, connector) WHERE revoked_at IS NULL DO UPDATE ... RETURNING id`. Verified concurrent storage race condition safety and historical revocation retention in `test/oauth_tokens_unique_constraint.test.ts` (5/5 passed).

### D7. No transaction wrapping in `pipelineWorker.ts` [RESOLVED]
**Files:** [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts#L290-L405), [`client.ts`](file:///home/jamesuchechi/Projects/Ballast/src/db/client.ts#L119-L144)
Previously, the brief pipeline persisted citations, actions, brief status updates, and runs telemetry across multiple sequential, un-isolated queries. A database disconnection or runtime error midway left the database in an inconsistent state with orphaned actions or unfinalized briefs.

**Resolution:** Implemented `withTransaction` in `src/db/client.ts` to manage isolated PostgreSQL client transactions with automatic `BEGIN`, `COMMIT`, and `ROLLBACK` on errors. Refactored `pipelineWorker.ts` to wrap the entire brief persistence phase (actions insertion, citations storage, brief published status update, and runs telemetry) inside `withTransaction`. Verified atomic commits and clean rollbacks without orphaned rows in `test/pipeline_worker_transaction.test.ts` (2/2 passed).

### D8. `toolRouter.ts` only supports 3 web results [RESOLVED]
**File:** [`toolRouter.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/toolRouter.ts#L22-L75)
Previously, `ToolRouter.executeWebSearch` had `maxResults: 3` hardcoded, restricting broader web queries in World mode.

**Resolution:** Updated `ToolRouter` and `ToolRouterContext` to support configurable `maxResults` via method option (`options.maxResults`), context object (`context.maxResults`), or environment variable (`WEB_SEARCH_MAX_RESULTS`), with a default limit of `DEFAULT_WEB_MAX_RESULTS = 5` and range clamping `[1, 20]`. Verified default handling, explicit limits, environment variable overrides, Home mode hard gating, and cost cap circuit breaking in `test/tool_router_config.test.ts` (6/6 passed).

### D9. Template-only cron scheduler — no timezone support [RESOLVED]
**Schema:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql), [`011_add_timezone_to_schedules.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/migrations/011_add_timezone_to_schedules.sql)
**Files:** [`scheduler.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/scheduler.ts), [`worker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/worker.ts), [`route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/schedules/route.ts)
Previously, `renderQuestionTemplate` only supported `{{date}}` formatted via UTC server time, and `worker.ts` evaluated crons using raw server time without respecting user/workspace timezones.

**Resolution:**
1. Applied migration `011_add_timezone_to_schedules.sql` and updated `schema.sql` adding `timezone TEXT NOT NULL DEFAULT 'UTC'` column to `schedules`.
2. Implemented `formatInTimezone` and enhanced `renderQuestionTemplate` in `src/core/scheduler.ts` with support for all template tags: `{{date}}`, `{{today}}`, `{{yesterday}}`, `{{time}}`, `{{datetime}}`, `{{timestamp}}`, `{{day_of_week}}`, `{{weekday}}`, `{{month}}`, `{{year}}`, `{{timezone}}`.
3. Updated `worker.ts` to pass schedule `tz` to `CronExpressionParser.parse(sched.cron, { currentDate: now, tz })`.
4. Updated schedules API routes (`GET`, `POST`, `PATCH`) to support specifying and updating schedule timezones.
5. Verified with 100% pass rate in `test/scheduler_timezone.test.ts` (5/5 passed).

### D10. The `briefQueue` and `actionQueue` don't set BullMQ job options [RESOLVED]
**Files:** [`briefQueue.ts`](file:///home/jamesuchechi/Projects/Ballast/src/queue/briefQueue.ts), [`actionQueue.ts`](file:///home/jamesuchechi/Projects/Ballast/src/queue/actionQueue.ts)
Previously, BullMQ queues lacked explicit job options, defaulting to 0 attempts (no retry on transient worker crashes or timeouts) and unbounded completed/failed job accumulation in Redis.

**Resolution:** Configured `DEFAULT_BRIEF_JOB_OPTIONS` and `DEFAULT_ACTION_JOB_OPTIONS` across `briefQueue.ts` and `actionQueue.ts` with `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`, `removeOnComplete: { age: 86400, count: 100 }`, and `removeOnFail: { age: 86400 * 7, count: 200 }`. Applied options at both the Queue level (`defaultJobOptions`) and per-job enqueue (`queue.add()`). Verified with 100% pass rate in `test/queue_job_options.test.ts` (3/3 passed).

---

## 🟠 Missing Features for MVP

### M1. No CSRF protection [RESOLVED]
**Files:** [`csrf.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/csrf.ts), [`auth.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/auth.ts), [`login/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/auth/login/route.ts), [`signup/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/auth/signup/route.ts)
Previously, authentication routes (`/api/auth/login`, `/api/auth/signup`) and session cookies lacked explicit CSRF protection and were configured with `SameSite=Lax`, creating vulnerability to cross-site request forgery and form submission abuse.

**Resolution:**
1. Configured all authentication and profile session cookies with `SameSite=Lax`, `HttpOnly=true`, and `Secure` via `getSessionCookieOptions()` in `src/lib/auth.ts` (enabling seamless OAuth cross-site redirect callback flows while protecting mutating requests via CSRF tokens).
2. Implemented `src/lib/csrf.ts` providing cryptographic HMAC-signed CSRF tokens, `verifyCsrf()` origin & referer validation against canonical origins, and double-submit token validation.
3. Created dedicated endpoint `GET /api/auth/csrf` for client token issuance.
4. Enforced CSRF origin and token validation on mutating authentication routes (`POST /api/auth/login` and `POST /api/auth/signup`).
5. Verified with 100% pass rate in `test/csrf_protection.test.ts` (5/5 passed).

### M2. No file virus/malware scanning [RESOLVED]
**Files:** [`scanner.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/scanner.ts), [`ingest.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/ingest.ts), [`upload/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/sources/upload/route.ts)
Previously, uploads were accepted into vector stores and source storage without scanning for embedded viruses, malicious PDF scripts, or disguised executable binaries.

**Resolution:**
1. Created multi-layer heuristic and signature scanner in `src/core/scanner.ts`:
   - Standard EICAR antivirus test signature detection.
   - Disguised binary executable detection (Windows PE `MZ`, Linux `ELF`, macOS `Mach-O`, Java bytecode).
   - Malicious PDF exploit vector detection (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFiles`).
   - Disguised shell/script payload detection in non-script formats (e.g. bash/PowerShell masquerading as `.png`/`.jpg`).
   - Socket connection support for external ClamAV daemon (`CLAMAV_HOST`/`CLAMAV_PORT`).
2. Integrated `scanBufferForMalware` into `ingestDocument` in `src/core/ingest.ts`. Upon threat detection, execution halts, an audit trail is recorded to `access_logs` (`source.malware_blocked`), and a detailed error is thrown.
3. Enhanced `src/app/api/sources/upload/route.ts` to respond with HTTP 422 (`malwareDetected: true`) and error details.
4. Added and verified end-to-end tests in `test/malware_scanner.test.ts` (8/8 passed).

### M3. No email verification on signup
Users can sign up with any email address they don't own. This is fine for MVP but becomes a problem when you start sending email notifications to unverified addresses.

### M4. No multi-workspace switching in the UI [RESOLVED]
**Files:** [`workspaces/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/workspaces/route.ts), [`workspaces/switch/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/workspaces/switch/route.ts), [`Sidebar.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/components/dashboard/Sidebar.tsx), [`ProfileView.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/components/dashboard/ProfileView.tsx), [`DashboardLayout.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/components/dashboard/DashboardLayout.tsx), [`page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/app/page.tsx)
Previously, users belonging to multiple workspaces in `workspace_members` were locked into whichever workspace was assigned at login with no UI or API endpoints to switch active workspace or create new ones.

**Resolution:**
1. Created `GET /api/workspaces` returning all workspaces associated with the authenticated user, their role, member count, plan tier, and active flag.
2. Created `POST /api/workspaces` allowing users to create new organizations/workspaces with automatic `owner` membership assignment and immediate active session transition.
3. Created `POST /api/workspaces/switch` with membership authorization checks, signing and setting a new `ballast_session` cookie for the selected workspace.
4. Added an interactive workspace switcher dropdown in `Sidebar.tsx` with active checkmarks, role badges, one-click switching, and inline "+ Create new workspace" input.
5. Added a dedicated "Workspaces & Organizations" management section in `ProfileView.tsx` with organization details, member counts, and switching controls.
6. Wired `onWorkspaceSwitched` in `DashboardLayout` and `page.tsx` to automatically refetch all workspace-specific data (briefs, sources, schedules, access logs, actions, notifications, flags, telemetry, analytics) without requiring manual page reload.
7. Verified with 100% pass rate in `test/workspace_switching.test.ts` (4/4 passed).

### M5. Schedule `question_template` has no validation [RESOLVED]
**Files:** [`templateValidator.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/templateValidator.ts), [`scheduler.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/scheduler.ts), [`route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/schedules/route.ts), [`[id]/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/schedules/%5Bid%5D/route.ts), [`page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/app/page.tsx)
Templates like `{{date}}` are silently passed through if unrecognized. A template with a typo (`{{Date}}`) will be treated as a literal string. No template preview in the UI.

**Fix:**
1. Created unified `src/lib/templateValidator.ts` defining `SUPPORTED_TEMPLATE_TAGS` (`date`, `today`, `yesterday`, `time`, `datetime`, `timestamp`, `day_of_week`, `weekday`, `month`, `year`, `timezone`), case-insensitive tag evaluation, `validateQuestionTemplate()`, `renderQuestionTemplate()`, and `previewQuestionTemplate()`.
2. Re-exported and enforced template validation in `src/core/scheduler.ts` inside `runSchedule()`.
3. Integrated `validateQuestionTemplate` in `POST /api/schedules` and `PATCH /api/schedules/[id]` to reject invalid tags with descriptive 400 error payloads.
4. Added interactive Schedule Modal UI enhancements in `src/app/app/page.tsx`:
   - Quick one-click tag insertion chips (`+ {{date}}`, `+ {{today}}`, etc.).
   - Real-time client-side tag validation warnings with actionable error lists.
   - Real-time Live Template Preview box showing what the prompt will render to with current time.
5. Verified with 100% pass rate in `test/scheduler_template_validation.test.ts` (6/6 passed).

### M6. No retry on failed schedules [RESOLVED]
**Files:** [`scheduler.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/scheduler.ts), [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts)
If a scheduled brief fails, the schedule's `last_run_brief_id` was previously updated prematurely at queue time to the unverified brief. When that run failed, subsequent scheduled runs would chain from a failed parent with `markdown = null`, corrupting the version lineage.

**Fix:**
1. Removed premature `UPDATE schedules SET last_run_brief_id` from `runSchedule()` in `src/core/scheduler.ts`.
2. Moved `last_run_brief_id` advancement inside the publication transaction in `src/core/pipelineWorker.ts` so schedules only advance to new parent briefs upon successful publication.
3. If a scheduled brief fails or errors, `schedules.last_run_brief_id` safely retains the last successfully published brief. The subsequent scheduled run automatically retries chaining against the verified baseline without context corruption.
4. Verified with 100% pass rate in `test/scheduler_failed_run_chaining.test.ts` (5/5 passed) and `test/phase7_scheduling_retention.test.ts`.

### M7. `notifications` table has no `read_at` timestamp [RESOLVED]
**Files:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql), [`012_add_read_at_and_dismissed_to_notifications.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/migrations/012_add_read_at_and_dismissed_to_notifications.sql), [`notifications.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/notifications.ts), [`route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/notifications/route.ts), [`page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/app/page.tsx)
The `read` column was previously a bare boolean without a timestamp of when it was read, and there was no support for notification dismissal or bulk-clearing.

**Fix:**
1. Created database migration `012_add_read_at_and_dismissed_to_notifications.sql` adding `read_at TIMESTAMPTZ`, `dismissed_at TIMESTAMPTZ`, and a partial index `idx_notifications_active (workspace_id, created_at DESC) WHERE dismissed_at IS NULL`.
2. Updated `src/core/notifications.ts` functions (`markNotificationRead`, `markAllNotificationsRead`) to set `read_at = COALESCE(read_at, NOW())`.
3. Added `dismissNotification()`, `dismissAllNotifications()`, `deleteNotification()`, and `deleteAllNotifications()` in `src/core/notifications.ts`.
4. Upgraded `/api/notifications` route:
   - `GET` supports `?include_dismissed=true` and limits.
   - `PATCH` supports `{ id, action: 'read' | 'dismiss' }` and `{ all: true, action: 'read' | 'dismiss' }`.
   - `DELETE` supports `?id=...` and `?all=true` for permanent deletion.
5. Upgraded Notifications UI in `src/app/app/page.tsx`:
   - Visual `✓ Read [timestamp]` indicator displayed on read notifications.
   - "Clear all" button to dismiss all notifications in one click.
   - Per-notification individual dismiss (Trash icon) button.
   - Optimistic state updates for instant responsive UI feedback.
6. Verified with 100% pass rate in `test/notifications_read_at_dismissal.test.ts` (7/7 passed).

### M8. No webhook support [RESOLVED]
**Files:** [`webhookHandler.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/webhookHandler.ts), [`[provider]/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/webhooks/%5Bprovider%5D/route.ts)
Connectors previously relied solely on cron polling or manual sync, causing brief generation to lag incoming changes until the next sync interval.

**Fix:**
1. Created real-time webhook receiver service `src/core/webhookHandler.ts`:
   - Built HMAC SHA-256 signature verification for GitHub (`X-Hub-Signature-256`) and Slack (`X-Slack-Signature` with 5-minute replay attack protection window).
   - Built handlers for GitHub events (`pull_request`, `issues`, `issue_comment`, `push`) and Slack Events (`message`, `url_verification` challenge).
   - Idempotent real-time vector ingestion (`ingestWebhookDocument`): deduplicates unchanged content, updates modified source rows with obsolete chunk pruning, and embeds fresh chunk vectors immediately.
   - Comprehensive audit trails recorded in `access_logs` (`webhook_sync:<connector>:<external_id>`).
2. Implemented API route `src/app/api/webhooks/[provider]/route.ts` handling:
   - `/api/webhooks/github`
   - `/api/webhooks/slack` (including URL verification handshake)
   - `/api/webhooks/generic`
3. Verified with 100% pass rate in `test/webhooks_realtime_sync.test.ts` (8/8 passed).

### M9. The world mode only fetches 3 web results (`maxResults: 3`) [RESOLVED]
**Files:** [`web.ts`](file:///home/jamesuchechi/Projects/Ballast/src/connectors/web.ts), [`toolRouter.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/toolRouter.ts)
World mode previously hardcoded fetching only 3 web snapshots, which was insufficient context for complex multi-faceted questions.

**Fix:**
1. Increased `DEFAULT_WEB_MAX_RESULTS` from 3 to 10 in both `src/connectors/web.ts` and `src/core/toolRouter.ts`.
2. Expanded live search fetching across Wikipedia API and DuckDuckGo RelatedTopics in `fetchLiveWebPages` to return up to `maxResults` rich contextual snapshots.
3. Supported flexible overrides via explicit call options (`options.maxResults`), context object (`context.maxResults`), or environment variable (`WEB_SEARCH_MAX_RESULTS`), bounded between `[1, 20]` with safety clamping.
4. Verified with 100% pass rate in `test/web_search_max_results.test.ts` (5/5 passed) and `test/tool_router_config.test.ts` (6/6 passed).

### M10. No streaming for brief generation progress [RESOLVED]
**Files:** [`progressBroadcaster.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/progressBroadcaster.ts), [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts), [`stream/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/briefs/%5Bid%5D/stream/route.ts), [`page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/app/page.tsx)
The client previously had to poll `/api/briefs/[id]/progress` with `setInterval(..., 400)`, causing visible stepping delays and unnecessary network requests.

**Fix:**
1. Created `src/core/progressBroadcaster.ts` real-time pub/sub event broadcaster supporting high-throughput per-brief listeners.
2. Updated `appendProgress()` in `src/core/pipelineWorker.ts` to broadcast real-time event payloads synchronously to subscribers on every state transition (`retrieving_private`, `drafting`, `verifying`, `rendering`, `published`, `failed`).
3. Created Server-Sent Events (SSE) streaming route `GET /api/briefs/[id]/stream` returning `text/event-stream` with initial state delivery, real-time chunk streaming, and clean client disconnection teardown.
4. Added `subscribeToBriefProgress()` in `src/app/app/page.tsx` utilizing native `EventSource` for sub-millisecond progress updates, with automated seamless polling fallback if SSE is unavailable or interrupted.
5. Verified with 100% pass rate in `test/brief_progress_streaming.test.ts` (3/3 passed).

---

## 💡 Enhancements & New Features to Build (Post-MVP)

### E1. **Brief Summarization / TL;DR mode** [RESOLVED]
**Files:** [`types.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/types.ts), [`writer.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/writer.ts), [`assembler.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/assembler.ts), [`renderer.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/renderer.ts), [`pipeline.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipeline.ts), [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts), [`exporters.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/exporters.ts), [`013_add_summary_to_briefs.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/migrations/013_add_summary_to_briefs.sql), [`page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/app/page.tsx)
Briefs were previously long and structured without a fast executive takeaway.

**Fix:**
1. Added `summary?: string` to `DraftBriefSections`, `PublishedBriefSections`, and `BriefV1` in `src/core/types.ts` and `eval/schema/brief.v1.json`.
2. Instructed Writer in `src/core/writer.ts` to output a 1-2 sentence executive summary (TL;DR) strictly grounded in verified facts/quotes.
3. Updated `assembleBrief` in `src/core/assembler.ts` to synthesize a grounded 1-2 sentence TL;DR strictly from verified Critic `keep` claims (with safe refusal on empty evidence).
4. Added TL;DR blockquote rendering (`> **TL;DR:** ...`) in `src/core/renderer.ts` and Obsidian export in `src/core/exporters.ts` while preserving all 8 mandatory markdown headings and character claim spans.
5. Created database migration `013_add_summary_to_briefs.sql` adding `summary TEXT` column to PostgreSQL `briefs` table and persisted in worker and API routes.
6. Designed modern glassmorphic Executive Summary (TL;DR) callout banner in dashboard UI preview (`src/app/app/page.tsx`).
7. Verified with 100% pass rate in `test/brief_summarization_tldr.test.ts` (6/6 passed).

### E2. **Brief Digest / Weekly Summary Email** [RESOLVED]
**Files:** [`digestService.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/digestService.ts), [`emailService.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/emailService.ts), [`preferences/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/user/preferences/route.ts), [`digest/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/digest/route.ts), [`worker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/worker.ts), [`ProfileView.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/components/dashboard/ProfileView.tsx)
Instead of relying solely on individual per-brief notifications, users and workspaces can receive a weekly consolidated intelligence digest roll-up of all briefs published over a 7-day lookback window.

**Resolution:**
1. Created `src/core/digestService.ts` supporting:
   - `buildWorkspaceDigest`: Aggregates all briefs published within the 7-day window, verified claims counts, and associated proposed/executed actions.
   - `renderDigestEmailHtml` & `renderDigestEmailText`: Dark-mode, glassmorphic email templates with header date badges, key metrics strips (published briefs, verified claims, proposed actions), TL;DR summary quotes, direct brief links, and full `escapeHtml` sanitization (Security S5 compliance).
   - `sendWorkspaceDigest`: Dispatches to opted-in workspace members via Resend (or simulation fallback) and logs delivery to `access_logs` (`action = 'digest_sent:weekly:<count>_briefs'`).
   - `checkAndTriggerDueDigests`: Evaluates active workspaces for due weekly digests with 6-day double-send protection and zero-brief safety bypass.
2. Updated `UserNotificationPreferences` in `src/core/emailService.ts` and `src/app/api/user/preferences/route.ts` with `digest_enabled`, `digest_frequency` ('weekly' | 'daily'), and `digest_day` ('monday', etc.).
3. Created API route `src/app/api/digest/route.ts` supporting `GET` (live preview) and `POST` (on-demand test send).
4. Integrated autonomous digest checking loop (`startDigestLoop`, `checkAndTriggerDueDigestsPass`, `stopDigestLoop`) in `src/worker.ts` with telemetry exposed via `/health`.
5. Built **Email & Weekly Digest Notifications** card and interactive **Weekly Digest Preview Modal** in `src/components/dashboard/ProfileView.tsx`.
6. Verified with 100% pass rate in `test/brief_digest_email.test.ts` (8/8 passed) and regression verification across `test/security_email_xss.test.ts`, `test/brief_summarization_tldr.test.ts`, and `test/phase9_polish.test.ts`.

### E3. **Connector-level re-sync trigger from UI** [RESOLVED]
**Files:** [`sync/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/connectors/%5Bid%5D/sync/route.ts), [`sync-all/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/connectors/sync-all/route.ts), [`resync/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/sources/%5Bid%5D/resync/route.ts), [`ConnectorCard.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/components/dashboard/ConnectorCard.tsx), [`IntegrationsMarketplace.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/components/dashboard/IntegrationsMarketplace.tsx), [`page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/app/page.tsx)
Previously, users had no prominent UI triggers to manually force on-demand re-syncing of connected integrations (Gmail, GitHub, Google Drive, Google Calendar, Slack, Notion) or individual source records, requiring users to wait for periodic scheduled cron runs. Error retry states were also absent.

**Resolution:**
1. Enhanced single connector sync API route `POST /api/connectors/[id]/sync` to return structured metrics (`syncedCount`, `unchangedCount`, `durationMs`, formatted message) and record manual audit trail entries in `access_logs` (`action = 'connector_sync:manual:<id>'`).
2. Created batch sync API route `POST /api/connectors/sync-all` to run isolated parallel sync passes across all connected workspace integrations, return aggregated statistics (`totalConnected`, `totalSynced`, `totalUnchanged`, per-connector `results` & `errors`), and record `action = 'connector_sync:manual:batch'`.
3. Created individual source re-sync API route `POST /api/sources/[id]/resync` allowing users to re-fetch and re-embed specific documents/threads/pages from providers directly from the Evidence Knowledge table.
4. Upgraded `ConnectorCard.tsx` with high-visibility **"Re-sync Now"** and **"Retry Sync"** buttons, distinct error retry states, and responsive spinning indicators.
5. Upgraded `IntegrationsMarketplace.tsx` with a top-level **"Sync All Connected"** action button in the header and in-app feedback alerts with automatic duration and item count reporting.
6. Replaced browser `alert()` popups with rich in-app toast notifications in `page.tsx` and added row-level source re-sync buttons in the Evidence table.
7. Verified with 100% pass rate in `test/connector_resync_trigger.test.ts` (5/5 passed) and full regression verification across `test/brief_digest_email.test.ts` and `test/source_deduplication.test.ts`.

### E4. **Smart question suggestions** [RESOLVED]
**Files:** [`suggestions.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/suggestions.ts), [`route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/suggestions/route.ts), [`page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/app/page.tsx), [`smart_question_suggestions.test.ts`](file:///home/jamesuchechi/Projects/Ballast/test/smart_question_suggestions.test.ts)
Previously, the dashboard only showed static hardcoded suggestion prompt buttons that remained fixed regardless of what integrations users had connected, what evidence had been indexed, or how long ago prior briefs on key topics were generated.

**Resolution:**
1. Created smart suggestion engine [`src/core/suggestions.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/suggestions.ts) implementing `getSmartQuestionSuggestions(workspaceId, options)`:
   - **Stale Brief Topic Follow-ups**: Analyzes recent published briefs in `briefs`. If a topic hasn't been checked in $\ge 5$–7 days, generates proactive follow-up suggestions (*"You haven't checked on your [topic] in X days — what is the current status and latest updates?"*).
   - **Integration & Source-Aware Prompts**: Detects active connected integrations (`calendar`, `github`, `gmail`, `drive`, `slack`, `notion`, `upload`) and recent evidence in `sources.meta` to generate context-specific questions (e.g. meeting agenda prep for Calendar, active PR & deployment risks for GitHub, urgent client communications for Gmail, updated specs for Drive).
   - **Multi-Source Synergy Prompts**: Generates cross-connector questions combining email decisions with calendar deadlines or comparing code PRs against spec documents.
   - **Curated World Mode Prompts**: Surfacing relevant industry compliance (GDPR, SOC 2), webhook security standards, and API rate limit best practices.
   - **Starter Discovery Fallbacks**: Providing high-yield starter queries for newly created workspaces.
2. Implemented authenticated API endpoint `GET /api/suggestions?mode=home|world|all&limit=6` returning structured `{ suggestions, count }` payloads.
3. Upgraded dashboard UI in [`src/app/app/page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/app/page.tsx):
   - Dynamic smart suggestion pills with visual badges (⚡ Stale Topic, 📅 Calendar, 🐙 GitHub, ✉️ Gmail, 📁 Drive, 💬 Slack, 📝 Notion, 🌐 World).
   - Hover tooltips detailing the specific context and evidence rationale behind each suggestion.
   - 1-click prompt loading and automatic mode switching.
   - Interactive refresh/shuffle button (`🔄`) to re-query fresh suggestion angles on demand.
4. Verified with 100% pass rate in `test/smart_question_suggestions.test.ts` (6/6 passed).

### E5. **Brief Sharing (read-only, expiring link)** [RESOLVED]
**Files:** [`shareTokens.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/shareTokens.ts), [`share/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/briefs/%5Bid%5D/share/route.ts), [`[token]/route.ts`](file:///home/jamesuchechi/Projects/Ballast/src/app/api/share/%5Btoken%5D/route.ts), [`[token]/page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/share/%5Btoken%5D/page.tsx), [`ShareBriefModal.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/components/dashboard/ShareBriefModal.tsx), [`page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/app/page.tsx), [`brief_sharing.test.ts`](file:///home/jamesuchechi/Projects/Ballast/test/brief_sharing.test.ts)
Previously, Ballast had no mechanism to share published briefs externally with colleagues, clients, or stakeholders without requiring full user registration, workspace invitation, and credential setup.

**Resolution:**
1. Implemented cryptographic share token generation and validation in [`src/lib/shareTokens.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/shareTokens.ts) using HMAC-SHA256 signatures with constant-time equality checks and configurable expiration intervals (24h, 3d, 7d, 30d).
2. Created authenticated API route `POST /api/briefs/[id]/share` to verify workspace ownership, generate expiring tokens, record audit logs (`action = 'brief_share:create'`), and return `${origin}/share/${token}` links.
3. Created public read-only API route `GET /api/share/[token]` to safely serve sanitized brief markdown, title, mode, and expiration without exposing internal source IDs, tokens, or member data (privacy guarantee).
4. Created standalone public shared brief view in [`src/app/share/[token]/page.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/app/share/%5Btoken%5D/page.tsx) with formatted markdown sections, claim highlights, executive summary callouts, copy link, and print-to-PDF support.
5. Integrated [`ShareBriefModal.tsx`](file:///home/jamesuchechi/Projects/Ballast/src/components/dashboard/ShareBriefModal.tsx) into the dashboard brief viewer action bar with duration presets, 1-click clipboard copy, and public preview links.
6. Verified with 100% pass rate in `test/brief_sharing.test.ts` (6/6 passed).

### E6. **Mention @names in Actions**
When the Writer proposes an action like "Draft email to Elena", auto-resolve the recipient from calendar/Gmail contacts if possible. The action executor already builds RFC 2822 messages — just needs the `to` to be resolved.

### E7. **Brief Bookmarks / Star**
Let users mark briefs as important. A simple `starred BOOLEAN` column on `briefs` and a "starred" filter in the brief list. Low effort, high perceived value.

### E8. **Source health dashboard**
A view showing all connected sources, their last sync time, last error, and how many chunks each has indexed. `access_logs` already tracks this — it just needs a UI surface. Users need visibility into what the system knows.

### E9. **Conflict resolution workflow**
When the Critic flags a conflict (`citation_type=conflict`), there's no UI for the user to mark which source is correct. Adding a "I confirm Source A is accurate" action would:
1. Update the flag with resolution
2. Feed that decision back as context in the next scheduled brief

### E10. **LLM response caching (Redis)**
Brief questions that are identical or near-identical within a 24-hour window could skip re-generation and serve from cache. This would dramatically reduce LLM cost for scheduled daily briefs asking the same question.

### E11. **Connector sync status webhooks (outbound)**
Let users configure a webhook URL that Ballast calls when a brief is published. This enables integrations with tools like Make, Zapier, or n8n without building native integrations.

### E12. **Per-source trust level UI**
The `trust_boundary` column exists in the DB (`untrusted_content` for all connectors currently). Build a UI to let users upgrade a source to `verified` (for their own internal docs) vs `untrusted_content` (for external web pages). The Critic could weight verified sources differently.

### E13. **Citation inline hover preview**
In the rendered brief markdown, hovering over a citation should show the original quote inline. This requires the claim_span to be surfaced to the frontend alongside the markdown. The data is already in the DB — it just needs wiring to the UI.

### E14. **Notion write-back (export)**
When a brief is published, optionally push it as a new Notion page in a configured database. The Notion connector already exists for read — write would be a natural extension.

### E15. **Brief templates library**
Pre-built question templates: "Weekly team status", "Project health check", "Competitor news scan", "Meeting prep for [calendar event]". These could dramatically reduce time-to-first-value for new users.

---

## 🗂️ Missing Schema / Data Model

| Gap | Impact |
|-----|--------|
| No `UNIQUE(workspace_id, connector)` on `oauth_tokens` | Race condition on concurrent token refresh |
| No index on `chunks(source_id)` | Slow cascade deletes |
| No index on `access_logs(action)` | Slow retention pass check |
| No `starred BOOLEAN` on `briefs` | Feature M7 not possible |
| No `session_version` on `users` | Session invalidation not possible |
| No `read_at TIMESTAMPTZ` on `notifications` [RESOLVED] | Analytics on notification engagement (Resolved in Migration 012) |
| No `timezone TEXT` on `workspaces` | Cron jobs always fire in server timezone |
| No `last_error_at TIMESTAMPTZ` on `sources` | Can't tell if error is old/stale |

---

## 🔢 Dependency Audit

| Package | Version | Note |
|---------|---------|------|
| `next` | `^16.3.5` | Very recent — verify Next.js docs as AGENTS.md requires |
| `bullmq` | `^6.3.4` | Current — good |
| `pg` | `^8.23.0` | Current — good |
| `lucide-react` | `^1.45.0` | Unusually high version — verify icons haven't changed API |
| `cron-parser` | `^5.10.1` | Uses `CronExpressionParser` (correct for v5 API) |
| `@types/react` / `react` | `^19.3.0` | React 19 — Server Actions, `use()` hook available |
| `yaml` | `^2.7.0` | Used where? Not obvious in the code read |
| `tsx` | `^4.19.3` | Dev runtime — fine |
| Missing: `pdf-parse` or similar | — | PDF extraction is currently broken |
| Missing: `diff` npm package | — | Diff algorithm is O(n²) homebrew |
| Missing: CSRF package | — | No CSRF protection |

---

## 📋 Priority Action List (Pre-Billing MVP)

**🔴 Must fix before real users:**
1. Fix PDF extraction (plug in `pdf-parse`)
2. Fix embedding mismatch (one-provider-per-workspace or warn clearly)
3. Add similarity threshold to vector retrieval
4. Wrap pipeline persistence in a transaction
5. Hard-fail if `BALLAST_ENCRYPTION_KEY` or `SESSION_SECRET` is not set in production
6. Add `idx_chunks_source` DB index
7. Fix scheduled brief chaining to only update `last_run_brief_id` on success [DONE]
8. Fix real token counting from LLM API responses

**🟡 Should fix for polish:**
9. HTML-escape email template interpolations
10. Add `SameSite=Strict` to session cookie
11. BullMQ retry options on brief/action queues
12. Fix `versionChainLength` to use actual chain depth
13. Add `idx_access_logs_action` index
14. Remove image types from ALLOWED_EXTENSIONS or add multimodal extraction
15. Fix `openrouter` HTTP-Referer header to use `APP_URL`

**🟢 Nice to have / Phase 10+ scope:**
16. SSE/WebSocket for live progress streaming
17. Multi-workspace UI switcher
18. Email verification on signup
19. Session invalidation on account wipe
20. Brief bookmarks/starring

---

## Summary

Ballast is architecturally strong. The core citation-gating, the Writer/Critic separation, the multi-tier fallback on LLM and embeddings, and the workspace isolation in SQL are all production-grade thinking. The phased build plan was well-executed.

The gaps are mostly in **edges and polish** rather than fundamental architecture — PDF extraction, embedding consistency, real token counting, DB indexing, and a few security hygiene items. None of these are blockers to showing the product to friendly early users today, but several (especially PDF and token counting) will affect data quality and cost accuracy enough to matter.

The feature ideas in the Enhancement section — smart question suggestions, digest emails, connector re-sync, and inline citation preview — are the kind of things that turn a technically impressive tool into something users open every morning.
