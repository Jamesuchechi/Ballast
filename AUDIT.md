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

### 1. `mistral-embed` padding is semantically wrong
**File:** [`embeddings.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/embeddings.ts#L170-L176)
Mistral's `mistral-embed` produces **1024-dimensional** vectors. You zero-pad them to 1536 dimensions. **Zero-padding is mathematically incorrect** — cosine similarity against Gemini-produced 1536-dim vectors will be unreliable because the two spaces are incompatible. Zero-padded vectors will always score lower similarity against real 1536-dim vectors. This means if you switch embedding providers mid-dataset, retrieval silently degrades.

**Fix:** Either use only one embedding model per workspace (store which provider was used per source), or re-embed all chunks when the provider changes. The `db:reembed` script should handle this.

### 2. PDF text extraction is a stub
**File:** [`ingest.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/ingest.ts#L61-L75)
The PDF extraction regex `/([(][^)]+[)])\s*Tj/g` only works for uncompressed, non-stream PDF text objects. Modern PDFs (compressed, Type1 fonts, CIDFont) will silently return the fallback string `"[Document: filename] Text content extracted from PDF payload."` — meaning you'll index an empty placeholder instead of actual content. Users will get `No citable evidence found` when uploading PDFs.

**Fix:** Integrate `pdf-parse`, `pdfmium`, or call a Gemini Document Understanding API endpoint for PDF text extraction.

### 3. Image files index a static string — not usable for retrieval
**File:** [`ingest.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/ingest.ts#L78-L80)
`.png`, `.jpg`, `.jpeg` files are stored with the text `"[Image Asset: filename] Image source metadata embedded for reference."` — this will never contribute to any useful retrieval. It's a placeholder that was never completed.

**Fix:** Either remove image types from `ALLOWED_EXTENSIONS`, or add Gemini Vision / multimodal extraction.

### 4. Tokens in `runs` table are not real token counts
**File:** [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts#L508-L509)
```ts
question.length * 3 + 450, // tokens_in
markdown.length,            // tokens_out
```
These are character-based estimates. `tokens_in` is especially wrong — it doesn't account for the full prompt (retrieved quotes, source blocks, system prompt). `tokens_out` is also wrong since markdown character length ≠ token count.

**Fix:** Add actual token counting from the LLM response. Gemini API returns `usageMetadata.totalTokenCount`; Groq/OpenAI-compatible return `usage.prompt_tokens` and `usage.completion_tokens`. Pass them back from `llmCall()` and accumulate properly.

### 5. `retrieval.ts` has no similarity threshold
**File:** [`retrieval.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/retrieval.ts#L44-L60)
Vector retrieval orders by cosine distance but has no `WHERE distance < 0.7` (or equivalent) cutoff. Low-relevance chunks can be returned. If there's nothing relevant in the corpus, you still return 8 chunks — which the Writer will try to use, and the Critic will then drop. This is wasteful and also means `unchecked` may be under-reported.

**Fix:** Add a distance threshold filter (e.g., `WHERE (c.embedding <=> $1::vector) < 0.75`) and expose the actual distance in `RetrievedQuote`.

### 6. Session token is a simple HMAC — no session invalidation
**File:** [`auth.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/auth.ts#L44-L67)
The session is a `base64(payload).HMAC` token stored in a cookie. Once issued, **there's no way to invalidate it** (e.g., on password change, on account deletion, on suspicious activity). The token is valid for 30 days regardless.

**Fix:** Store `session_version` or a `jti` (token ID) in the `users` table. On validation, check that the token's version matches. Incrementing `session_version` on password change or account wipe instantly invalidates all existing sessions.

### 7. `wipeWorkspaceAccount` does not invalidate open sessions
**File:** [`deletion.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/deletion.ts#L199-L221)
After wipe, users can still use an existing cookie to re-authenticate and hit authenticated routes (until the 30-day session expires). The user record is deleted so eventually they'd fail, but there's a window where the cookie is valid against a deleted workspace.

### 8. Cost estimate baseline is hardcoded to `$0.0025`
**File:** [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts#L100)
```ts
let totalCost = 0.0025; // baseline generation cost
```
This is a magic number. With free-tier providers (Groq, OpenRouter free tier), the actual cost may be zero. With Gemini Pro, it could be higher. This also means `runs.cost` is always overstated by `$0.0025`.

### 9. `diff.ts` version chain length is always `2`
**File:** [`diff.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/diff.ts#L222)
```ts
versionChainLength: 2,
```
This is hardcoded. The function already walks the chain in `getRootBriefId` but doesn't use the chain length in the result. The UI or API consumers would incorrectly show "2" regardless of the actual chain depth.

### 10. `computeLineDiff` diff algorithm is O(n²) worst-case
**File:** [`diff.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/diff.ts#L111-L140)
The greedy diff uses `oldLines.includes(newLines[j], i)` and `oldLines.indexOf(...)` inside the main loop — this is O(n²) on long briefs. Not blocking today but will degrade noticeably on large markdown documents.

**Fix:** Use the Myers diff algorithm or LCS-based approach. Or just use the `diff` npm package.

### 11. `SecretsManager.rotateToken` doesn't revoke the old token
**File:** [`secretsManager.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/secretsManager.ts#L70-L85)
`rotateToken` calls `storeEncryptedToken` which does an `UPDATE` on the existing row — so the old token is overwritten in-place (which is fine). But it logs `token_rotated` even though this is the same underlying flow as `setToken`. There's no actual difference between `setToken` and `rotateToken`.

### 12. The `openrouter` header `HTTP-Referer` is `https://ballast.local`
**File:** [`llm.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/llm.ts#L133)
OpenRouter uses this for model ranking and rate limit grouping. Using `ballast.local` will put all traffic in the "unknown app" bucket and potentially affect free tier limits. Should be the actual production URL when deployed.

---

## 🔴 Security Concerns

### S1. Default encryption key is a hardcoded string
**Files:** [`tokenStore.ts`](file:///home/jamesuchechi/Projects/Ballast/src/connectors/tokenStore.ts#L4-L10), [`objectStore.ts`](file:///home/jamesuchechi/Projects/Ballast/src/storage/objectStore.ts#L23-L29)
```ts
'ballast_default_aes_256_gcm_master_key_seed_2026'
```
This is a fallback when `BALLAST_ENCRYPTION_KEY` is not set. In production, if this env var is missing, all encrypted data uses a known-plaintext key. The code warns about this in `.env.example`, but at runtime there's no hard failure or warning.

**Fix:** In production (`NODE_ENV=production`), throw immediately if `BALLAST_ENCRYPTION_KEY` is not set rather than silently falling back.

### S2. Default session secret is a hardcoded string
**File:** [`auth.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/auth.ts#L4)
Same issue — silent fallback to `'ballast_super_secret_session_key_for_dev_32b'` in production if `SESSION_SECRET` is missing.

### S3. `rejectUnauthorized: false` in production
**File:** [`client.ts`](file:///home/jamesuchechi/Projects/Ballast/src/db/client.ts#L34)
```ts
ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
```
This disables TLS certificate validation — the connection is encrypted but not authenticated. A MITM could intercept database traffic. This is common for quick setups with self-signed certs, but worth noting.

**Fix:** Configure proper CA certificates for production or use `rejectUnauthorized: true` with the correct CA cert from your DB provider.

### S4. Rate limiting is per-IP, easily bypassed
**File:** [`rateLimit.ts`](file:///home/jamesuchechi/Projects/Ballast/src/lib/rateLimit.ts#L38-L49)
`x-forwarded-for` is trusted as the client IP. Behind a proxy you control, this is fine. But if the proxy is misconfigured or requests bypass it, an attacker can spoof the header.

### S5. XSS risk in email template
**File:** [`emailService.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/emailService.ts#L97-L107)
User-controlled strings (`params.title`, `params.question`) are interpolated directly into HTML without escaping:
```ts
<h1>...${params.title}...</h1>
<p>...${params.question}...</p>
```
If a user's brief title contains `<script>` tags, this could execute in email clients that render JS (rare, but possible with some clients).

**Fix:** HTML-escape all user-controlled strings before template interpolation.

### S6. `actions` table `type` constraint doesn't include all types used in code
**Schema:** The CHECK constraint in `actions` is `type IN ('email_draft', 'issue_draft', 'comment_draft', 'task')`. This is correct and matches the code. ✓

---

## 🟡 Design Gaps & Technical Debt

### D1. `pipeline.ts` and `pipelineWorker.ts` are near-duplicates
**Files:** [`pipeline.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipeline.ts), [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts)
`pipeline.ts` is a stateless, eval-friendly version. `pipelineWorker.ts` is the production version with DB persistence, BullMQ, notifications. They share a lot of identical logic (answer construction, conflict surfacing, action sanitization). If you fix a bug in one, you need to fix it in the other.

**Fix:** Extract shared logic into a pure `assembleBrief(draft, criticOut, ...)` function that both can call.

### D2. All actions are inserted as `email_draft` regardless of content
**File:** [`pipelineWorker.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/pipelineWorker.ts#L412-L425)
```ts
type, payload\n) VALUES ($1, $2, 'email_draft', $3)
```
The action type is hardcoded to `'email_draft'` for all proposed actions — even ones that should be `task` or `issue_draft`. The Writer can propose "create a GitHub issue" in `sections.actions`, but it always gets stored as `email_draft`.

**Fix:** The Writer's action format should include a structured type (e.g., `{type: 'issue_draft', repo: '...', body: '...'}`) and the pipeline should parse and route accordingly.

### D3. `sources` table has a `UNIQUE` on `(workspace_id, external_id)` but schema shows none
**Schema:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql) — there's no `UNIQUE(workspace_id, external_id)` constraint on `sources`. The `ingest.ts` deduplication relies on `checksum` match only. Two sources with the same `external_id` but different checksums (e.g., updated files) can coexist — which is intentional. But two connector syncs of the same email thread with the same `external_id` will create duplicate sources. The connectors should check `external_id` not just `checksum`.

### D4. The `chunks` table has no index on `source_id`
**Schema:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql#L219-L229)
Indexes exist for `workspace_id` and `source_id` on other tables, but `chunks` only has `idx_chunks_workspace`. Deleting a source requires `DELETE FROM chunks WHERE source_id = $1` (via CASCADE) — without an index on `source_id`, this is a sequential scan on potentially millions of chunk rows.

**Fix:** Add `CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id)`.

### D5. `access_logs` has no index on `action` or `source_id`
**Schema:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql#L229)
The retention pass queries `WHERE action LIKE 'retention_global_pass:%'`. With no index on `action`, this is a full table scan of `access_logs` every hour.

**Fix:** Add `CREATE INDEX IF NOT EXISTS idx_access_logs_action ON access_logs(action)` and `CREATE INDEX IF NOT EXISTS idx_access_logs_source ON access_logs(source_id)`.

### D6. `oauth_tokens` has no UNIQUE constraint on `(workspace_id, connector)`
**Schema:** [`schema.sql`](file:///home/jamesuchechi/Projects/Ballast/src/db/schema.sql#L194-L205)
`storeEncryptedToken` checks for existing rows and does an UPDATE if found — but relies on `ORDER BY created_at DESC LIMIT 1` to pick the right row. If two token-store calls race, you could end up with two rows for the same workspace+connector (both with `revoked_at IS NULL`).

**Fix:** Add `UNIQUE(workspace_id, connector)` (filtered by `revoked_at IS NULL`) or use `ON CONFLICT (workspace_id, connector) DO UPDATE`.

### D7. No transaction wrapping in `pipelineWorker.ts`
The pipeline persists citations, actions, runs, and the final brief status in multiple sequential queries. A crash between any two steps leaves the DB in a partially committed state (e.g., citations inserted but `status` still `running`).

**Fix:** Wrap the persistence phase (citations + actions + runs + status update) in a PostgreSQL transaction.

### D8. `toolRouter.ts` only supports 3 web results
**File:** [`toolRouter.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/toolRouter.ts#L51-L55)
`maxResults: 3` is hardcoded. For complex World mode queries this may be insufficient. Should be configurable.

### D9. Template-only cron scheduler — no timezone support
**File:** [`scheduler.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/scheduler.ts#L31-L35)
`renderQuestionTemplate` only supports `{{date}}`. If users in non-UTC timezones set a "9am daily" cron, the date shown in the question may be wrong (yesterday vs today). Also, `CronExpressionParser` in the worker (`worker.ts`) uses server time, not workspace timezone.

### D10. The `briefQueue` and `actionQueue` don't set BullMQ job options
**Files:** [`briefQueue.ts`](file:///home/jamesuchechi/Projects/Ballast/src/queue/briefQueue.ts), [`actionQueue.ts`](file:///home/jamesuchechi/Projects/Ballast/src/queue/actionQueue.ts)
No `attempts`, `backoff`, or `removeOnComplete`/`removeOnFail` settings. BullMQ defaults to 0 retries. If the worker crashes during a brief job, the job is marked failed immediately with no retry.

**Fix:** Set `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`, and `removeOnComplete: { count: 100 }` in the job options.

---

## 🟠 Missing Features for MVP

### M1. No CSRF protection
Auth routes (`POST /api/auth/login`, `POST /api/auth/signup`) are not CSRF-protected. The session cookie doesn't have `SameSite=Strict`. Depending on browser behavior, cross-site form submissions could abuse authenticated endpoints.

**Fix:** Add `SameSite=Strict` to the session cookie and a CSRF token for state-mutating requests.

### M2. No file virus/malware scanning
**File:** [`ingest.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/ingest.ts)
TODO.md explicitly lists "Virus scanning on uploads" under Later/Optional. But accepting raw PDF/image uploads without scanning is a real risk for a multi-tenant product.

### M3. No email verification on signup
Users can sign up with any email address they don't own. This is fine for MVP but becomes a problem when you start sending email notifications to unverified addresses.

### M4. No multi-workspace switching in the UI
The auth system supports multiple workspaces per user (`workspace_members` table, `authenticateUser` picks the primary workspace). But there's no UI to switch between workspaces. Users with multiple workspaces are stuck in whichever one was picked at login.

### M5. Schedule `question_template` has no validation
**File:** [`scheduler.ts`](file:///home/jamesuchechi/Projects/Ballast/src/core/scheduler.ts)
Templates like `{{date}}` are silently passed through if unrecognized. A template with a typo (`{{Date}}`) will be treated as a literal string. No template preview in the UI.

### M6. No retry on failed schedules
If a scheduled brief fails, the schedule's `last_run_brief_id` still gets updated to the failed brief. The next run will chain from a failed parent — the `parentBrief` context in the Writer will have `markdown = null` (or failed state), potentially corrupting the chain context.

**Fix:** Only update `last_run_brief_id` when the brief is successfully published.

### M7. `notifications` table has no `read_at` timestamp
**Schema:** The `read` column is a boolean. There's no timestamp of when it was read, no notification dismissal, no bulk-clear. The in-app notification UX will be limited.

### M8. No webhook support
Connectors sync on a schedule (or on-demand). There's no webhook receiver for real-time triggers (new Slack message, new GitHub PR). This means brief generation always lags the source by the sync interval.

### M9. The world mode only fetches 3 web results (`maxResults: 3`)
For a "grounded OS" positioning, 3 web snapshots is quite thin. Complex questions may need more context.

### M10. No streaming for brief generation progress
The `progress` field in the brief is JSONB appended server-side. The client has to **poll** to see updates. There's no SSE or WebSocket stream. This means the progress UI has a polling delay (visible as "stepping" rather than smooth progress).

---

## 💡 Enhancements & New Features to Build (Post-MVP)

### E1. **Brief Summarization / TL;DR mode**
Right now briefs can be long and structured. A one-sentence TL;DR (grounded in keep-claims only) at the top would dramatically improve skim-ability. This could be a Writer instruction: include a `summary` field with max 2 sentences.

### E2. **Brief Digest / Weekly Summary Email**
Instead of sending a notification per brief, aggregate all briefs published in the last 7 days into a digest email. This is more useful than per-brief emails for users with multiple schedules.

### E3. **Connector-level re-sync trigger from UI**
Currently there's no "re-sync now" button visible in the connector card. Users who connect Gmail can't force a sync — they have to wait for the scheduled run. This is the #1 pain point in early user testing for sync-based products.

### E4. **Smart question suggestions**
Based on the connected sources and recent brief history, suggest questions the user could ask. "You haven't checked on your Q3 deliverables in 7 days — want a status brief?" This drives engagement and demonstrates the product's value automatically.

### E5. **Brief Sharing (read-only, expiring link)**
Currently: "No public share links in v1." For MVP+, an expiring signed URL that shows a read-only version of the brief (no source details, just the markdown) would make the product shareable without requiring multi-user auth.

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
| No `read_at TIMESTAMPTZ` on `notifications` | Analytics on notification engagement |
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
7. Fix scheduled brief chaining to only update `last_run_brief_id` on success
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
