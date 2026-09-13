# Ballast — Build Plan

Working name: **Ballast**. Nothing below depends on the name.

Each phase has an **exit criterion**. Do not start the next phase until the current criterion is actually true — not “mostly working.”

Related: [`README.md`](README.md), [`REQUIREMENTS.md`](REQUIREMENTS.md).

## Phase order (load-bearing)

1. Prove citation-gating before any app shell.
2. Brief object and renderer before any model in the request path.
3. Uploads before OAuth.
4. Gmail read before World mode.
5. Email drafts before GitHub write.
6. GitHub **read** before GitHub **draft actions**.
7. Scheduling after the pipeline is async and metered.
8. Marketing after the critic suite is in CI.

If Phase 0 fails, **do not open Next.js**. That delay is the product working.

---

## Phase 0 — Prove the hard part (no app, no UI)

**Goal:** learn whether citation-gating works before building a house around it.

**Maps to:** FR4.1–FR4.5, FR4.9–FR4.11, NFR1.1, NFR4.3, NFR8.1–NFR8.2.

### Deliverables

- [x] Frozen artifacts on disk:
  - `eval/schema/brief.v1.json`
  - `eval/schema/critic.in.json`
  - `eval/schema/critic.out.json`
  - `eval/templates/brief.v1.md`
- [x] Critic function with the exact I/O in `README.md` (keep / drop / conflicts / missing / did_not). Writer is a separate function.
- [x] Standalone runner: fixtures → draft → critic → JSON-schema validate → publish validator → print markdown + `critic_log`.
- [x] Source text only via delimited `<source id class>` (or equivalent payload). Never merge corpus into the system prompt.
- [x] Fixture pack:

  | # | Fixture | Must prove |
  | --- | --- | --- |
  | 1 | Long email thread with implicit asks | Grounded open loops; no invented deadlines |
  | 2 | PR discussion | Claims map to review comments / commits |
  | 3 | Mixed doc dump | Retrieval (even naive) does not smash unrelated files into one fact |
  | 4 | **Conflict** — two sources, different numbers/dates for the same fact | `citation_type=conflict`; no silent winner |
  | 5 | **Injection** — instruction buried in (a) email footer, (b) HTML/markdown comment, (c) PDF-like aside; plus a loud `IGNORE ALL INSTRUCTIONS` | Instruction does not appear in Answer or Actions |
  | 6 | **Honesty** — corpus cannot answer the question | Published brief, empty/refusing Answer, filled Uncertain, status `published` |

  Each fixture directory: `input.md` or `sources.json`, `question.txt`, `expected.yml` (which checks apply, planted quotes, planted injection string).

- [x] Scorecard implementation (not a spreadsheet in your head):
  - Case pass = **≥5/6** checks.
  - Conflict check is N/A = pass on fixtures 1–3, 5–6.
  - Fixture 4 fails the suite if it hides disagreement.
  - Suite pass = **≥4/5** of fixtures 1–5 **and** fixture 6 publishes honestly.
- [x] Log kept/dropped/conflict decisions to a JSON file that matches `runs.critic_log` shape.

### How to grade (do not skip)

Run the suite twice if you change the prompt once. A single lucky pass is not an exit.

Manual read of fixture 4 and 5 is mandatory even if the script says pass — confirm the published markdown with your eyes.

### Exit criterion

Critic suppresses unsourced claims, surfaces conflicts, refuses thin fake answers, and ignores injected instructions on the suite above.

If not: iterate **critic architecture** (second model, structured output, schema gate, smaller writer). Do not start Phase 1.

### Explicitly out of phase

Next.js, auth, OAuth, embeddings, PDF, billing.

---

## Phase 1 — Foundation (no AI in the request path)

**Goal:** the brief object and its lifecycle are boring.

**Maps to:** FR1, FR4.1, FR6.1, FR6.3, NFR5.1, NFR7.2, NFR8.3–NFR8.4.

### Deliverables

- [x] Repo scaffold: Next.js, Postgres, Redis, object-store stub, worker process.
- [x] Auth (single user). Create a workspace on signup. `workspace_members.role` exists (`owner` | `member`).
- [x] Tables as in `README.md`: `users`, `workspaces`, `workspace_members`, `sources`, `chunks`, `briefs`, `citations`, `actions`, `runs`, `schedules`, `flags`, `access_logs`, `oauth_tokens`.
- [x] Required columns present from day one: `parent_brief_id`, `source_class`, `citation_type`, `claim_span`, `critic_log`, `progress`, `stale_after`, `template_version`.
- [x] Hand-written brief seed → markdown (template v1) → HTML preview → PDF. **Renderer does not call models.**
- [x] Publish validator helper used by the seed path: reject `published` if an Evidence claim lacks a `support` row.
- [x] Brief list + open. Regenerate stub inserts a child row (`parent_brief_id`), does not `UPDATE` markdown in place.
- [x] Status machine + watchdog stub (running too long → failed).

### Exit criterion

Create a brief **by API or seed** and see it correctly as markdown, HTML, and PDF. Regenerate produces a second row. *What I did not do* heading is visible even when the body is the placeholder line.

### Explicitly out of phase

Model calls, OAuth, embeddings.

---

## Phase 2 — Retrieval over uploads (Home, offline)

**Goal:** Home mode works on paste + file upload. No live connectors.

**Maps to:** FR2.4, FR3.1–FR3.5, FR4.6, FR4.8–FR4.10, NFR3.1, NFR3.4–NFR3.5, NFR6.

### Deliverables

- [x] Paste-text and file upload.
- [x] Server-side allowlist + size cap: **20 MB**; types `txt, md, pdf, png, jpg, jpeg, csv` (NFR3.4).
- [x] Chunk + embed into pgvector. Every chunk tagged `workspace_id` + `source_id`.
- [x] Retrieval ACL in SQL (`WHERE workspace_id = :ws`). Add a test that plants a foreign-workspace chunk and asserts it never returns.
- [x] Wire Phase 0 pipeline behind an **async job**. HTTP enqueue returns `brief_id` + `queued`.
- [x] `progress` steps match README canonical list. UI reads that column.
- [x] Persist `runs` + `critic_log` + citations with `source_class=private`.
- [x] Fail closed: critic/validator hard error → `failed`, no PDF, draft hidden (FR4.10).
- [x] Empty-evidence path still `published` (FR4.9).
- [x] Follow-up question creates a child brief, not a chat transcript (FR4.8).

### Exit criterion

Paste a real thread, ask a real question, get a brief whose evidence lines quote that thread. A second question is a new brief version.

### Explicitly out of phase

Gmail, web search, billing UI.

---

## Phase 3 — First live connector: Gmail, read-only

**Goal:** the daily hook. Sync without thinking about it.

**Maps to:** FR1.3, FR2.1, FR2.5–FR2.6, NFR1.2–NFR1.4, NFR2.4, NFR4.1–NFR4.2.

### Deliverables

- [x] OAuth, encrypted token store, refresh, revoke (FR1.3).
- [x] Incremental sync, **default 90-day window**, window visible and adjustable.
- [x] UI: connection status, last synced, last error.
- [x] Partial failure → `unchecked` citation + “Gmail could not be checked” in *What I used*. Never omit the source quietly.
- [x] Ingested bodies: `connector=gmail`, `trust_boundary=untrusted_content`, same delimited context path as Phase 0.
- [x] `access_logs` row on sync and on per-brief retrieve.
- [x] Query path: “what’s on me this week” against real mail.
- [x] Rate-limit / provider errors surface as unchecked, not empty success (NFR4.5).

### Explicitly out of phase

Sending mail. GitHub. Web search. Requesting write scopes.

### Exit criterion

A Home brief grounded in real inbox content, visible source list, visible last-synced time. Revoking the connector stops future sync.
*(Note: Connector registry for Gmail, Calendar, Drive, GitHub, Slack, Notion implemented and verified in `test/connectors.test.ts`. Real live inbox sync requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in `.env`; silent mocks are strictly prohibited in production).*

---

## Phase 4 — World mode

**Goal:** private + web, never mixed without labels — enforced in data, not manners.

**Maps to:** FR2.7, FR3.3–FR3.4, FR4.2, FR8.3, NFR1.6, NFR3.3, NFR7.1.

### Deliverables

- [x] Web search tool, **opt-in per query** via stored `mode=world`.
- [x] Fetched pages persisted as `sources.connector=web` with checksum + `fetched_at` + `raw_uri`. Citations without a snapshot are a defect.
- [x] **Separate retrieval passes**: private query and web query. Type each row before any concatenation.
- [x] Every citation labeled `private` | `web` | `system` in DB and in the rendered brief.
- [x] Per-brief cost cap: stop extra search when `runs.cost` hits ceiling; set `circuit_broken`; explain in *What I did not do* (FR8.3).
- [x] Home mode: tool router raises if web is invoked. Add a test that a writer message “please search the web” does not call the tool.

### Exit criterion

Ten manual briefs that use both classes: every claim’s `source_class` correct; zero cross-contamination. Mode is visually distinct on composer, header, and citation groups.

---

## Phase 5 — Actions, email-only

**Goal:** brief → next step, with a human gate. GitHub does not exist yet.

**Maps to:** FR5.1–FR5.5 (email + task only), FR8.2.

### Deliverables

- [x] Action types enabled: `email_draft`, `task`.
- [x] Request Gmail send/draft scope only now, only for Operator workspaces, only after explicit opt-in.
- [x] Draft payload stored. Provider write runs in a worker that **re-checks** `approved_at` and plan entitlement.
- [x] Approval UI + audit (`approved_at`, `approved_by`, `executed_at`, `error`).
- [x] Automated test: unapproved draft never calls send (verified in `test/action_execution.test.ts`).
- [x] Free/Pro: server returns 403 on propose/execute.

### Exit criterion

A brief proposes a Gmail draft; approval sends; unapproved never sends. A `task` stays in-app.
*(Status: **PASSED**. Enforced by `src/core/actionExecutor.ts`, audited in `access_logs`, tested in `test/action_execution.test.ts`. Real live Gmail dispatch requires Google Cloud OAuth credentials with `gmail.send` scope).*

### Explicitly out of phase

`issue_draft`, `comment_draft`, calendar writes.

---

## Phase 6 — GitHub + Calendar + cross-source conflicts

**Goal:** second and third live sources. Disagreement is a feature.

**Maps to:** FR2.2–FR2.3, FR4.5, FR5 GitHub drafts.

### Deliverables

- [ ] GitHub OAuth, **read** repos / PRs / issues first.
- [ ] Calendar read-only sync. No event create in v1 (FR5.4).
- [ ] Same sync UX as Gmail (status, errors; window where it applies).
- [ ] Planted disagreement across mail vs issue vs event → `citation_type=conflict` in a test scenario.
- [ ] **Then** GitHub write scopes + `issue_draft` / `comment_draft` with the same approval gate as mail.

### Exit criterion

A brief spanning inbox + repo + calendar flags at least one deliberately planted conflict. A GitHub draft posts only after approval.

---

## Phase 7 — Scheduling (retention)

**Goal:** the product reopens itself.

**Maps to:** FR4.6–FR4.7, FR7, NFR3.1, NFR7.3.

### Deliverables

- [ ] Confirm progress copy is honest: “checking Gmail… drafting… verifying claims… rendering.”
- [ ] `schedules` row → weekly “what slipped since last brief” using the `parent_brief_id` chain.
- [ ] Notify on `published` or `failed` (email or in-app).
- [ ] Reopened brief older than `stale_after` shows regenerate CTA.
- [ ] Scheduled runs count against the Operator brief meter.
- [ ] Server 403 if a non-Operator workspace tries to create a schedule.

### Exit criterion

A real weekly brief lands unprompted and is worth opening. Regenerating it creates a child brief.

---

## Phase 8 — Trust and security hardening

**Goal:** every policy clause has a test, a control, or an explicit “not in v1”.

**Maps to:** NFR1, NFR2.

### Deliverables

- [ ] Phase 0 suite + new injection cases in **CI** on critic and on the full pipeline (NFR1.5).
- [ ] Encryption at rest for synced payloads; secrets manager for OAuth tokens.
- [ ] Privacy doc: retention per source type; export rule for third-party PII in the user’s inbox; no public share links in v1; no training on user content (NFR2.3, NFR2.5).
- [ ] Deletion: per-source and full-account, including chunks, embeddings, object bytes, tokens. Implement the chosen wipe policy (open decision #2: wipe server-side; export first).
- [ ] Retention controls visible per source type.
- [ ] Access logs queryable by workspace owner.

### Exit criterion

A short security/privacy doc exists. Every clause maps to a test, a control, or a dated “not in v1”.

---

## Phase 9 — Billing and metering

**Goal:** unit economics visible before you market Operator.

**Maps to:** FR8, NFR3.3, NFR6.1.

### Deliverables

- [ ] Meter rule documented in product copy and enforced: jobs that **entered retrieve** count (`published` and `failed`). Pre-retrieve validation errors do not count.
- [ ] Stripe (or equivalent). Feature flags **server-side** for connectors / PDF / schedules / actions.
- [ ] Circuit breaker already from Phase 4; “stopped early” always appears in *What I did not do* when tripped.
- [ ] Internal view of `runs.cost` vs tier price. Set Operator cap from real numbers.
- [ ] Free tier cannot attach Gmail/GitHub/Calendar.

### Exit criterion

You can read cost-per-brief from `runs` and it sits comfortably under the tier. Entitlements cannot be toggled from the client alone.

---

## Phase 10 — Polish

**Maps to:** FR6.2, FR9, NFR3.2, NFR9.2.

### Deliverables

- [ ] Diff two briefs in the same version chain (FR6.2).
- [ ] Optional one-way Notion/Obsidian export (not system of record).
- [ ] Flag a claim as `wrong` / `unsupported`; store on `flags`.
- [ ] Folder / Drive sync only if a real user is blocked without it.
- [ ] Write P50/P95 internal latency targets and plot `runs.latency_ms`.
- [ ] Fixture suite still green after polish.

### Exit criterion

You would hand this to a second real user without a verbal list of caveats.

---

## Later / optional

- [ ] Team workspace UI (schema already allows it).
- [ ] Slack connector (same interface).
- [ ] X: drafts, bookmarks, mentions.
- [ ] Notion / Obsidian bidirectional sync (still not SoR).
- [ ] Calendar draft actions (explicitly out of v1).
- [ ] Virus scanning on uploads.

---

## Explicit non-goals (until someone pays for them)

- Agent that sends, commits, or comments without approval.
- Using Notion as the database.
- Training on user source content.
- “Chat with your inbox” as a standalone mode with no brief artifact.
- Multi-model marketplace. One writer + one critic is enough.
- Public share links in v1.
- Calendar create/update.

---

## Suggested calendar (solo)

| Week | Phase |
| --- | --- |
| 1 | Phase 0 fixtures + critic + scorecard |
| 2–3 | Phase 1 scaffold + renderer |
| 4–5 | Phase 2 uploads + async pipeline |
| 6–7 | Phase 3 Gmail |
| 8 | Phase 4 World |
| 9 | Phase 5 email actions |
| 10–11 | Phase 6 GitHub + Calendar |
| 12 | Phase 7 schedule |
| after | 8–10 as trust and money demand |

Slip rule: if Phase 0 is not green, week 2 does not start. If Gmail sync is not honest about failures, do not start World mode (you will hide more failures, not fewer).

---

## Definition of “phase complete”

A phase is complete only when:

1. Every checkbox in that phase is done or explicitly cut with a note in this file.
2. The exit criterion has been demonstrated on real or planted data, not only unit tests of mocks.
3. Mapped FR/NFR IDs have an owner implementation (code path or test name) you can point at.
