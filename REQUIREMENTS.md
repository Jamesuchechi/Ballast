# Ballast — Requirements

Normative companion to [`README.md`](README.md) (product, schema, critic contract) and [`TODO.md`](TODO.md) (phased plan).

IDs are stable. If a requirement moves phases, keep the ID. Do not reuse IDs.

Status of the product today: **Phase 0**. Requirements marked “first phase N” may be unimplemented; they are still binding for that phase’s exit.

---

## Conventions

- **Must / must not** are testable. “Should” is reserved for UX preference and is not used below.
- “Prompt wording” is never a sufficient control when this document asks for an architectural or schema control.
- v1 means everything through Phase 10 except items listed under Later in `TODO.md`.

---

## Functional requirements

### FR1 — Auth and workspace

- **FR1.1** User can sign up and log in (email or OAuth).
- **FR1.2** Every record (`sources`, `chunks`, `briefs`, `citations`, `actions`, `runs`, `schedules`, `flags`, `access_logs`, `oauth_tokens`) is scoped to `workspace_id`, including single-user v1.
- **FR1.3** User can view and revoke connected sources and granted OAuth scopes at any time. Revoke stops future sync and marks tokens `revoked_at`. Deletion of stored payloads is NFR2.2.
- **FR1.4** `workspace_members.role` is `owner` | `member` from v1. UI may ignore roles until a team tier. No schema migration required to invite a second user.
- **FR1.5** A user belongs to at least one workspace after signup. Briefs never exist without a workspace.
- **FR1.6** All data-plane queries include `workspace_id` in the database predicate. Application-layer filtering alone is insufficient (see NFR5.2).

### FR2 — Source connectors

- **FR2.1 Gmail** — read-only incremental sync. Default window last **90 days**, user-adjustable, window shown in UI. Send/draft scope is not requested until Actions are enabled for that workspace and the user opts in (FR5, FR8.2, NFR1.4).
- **FR2.2 GitHub** — read repos, PRs, issues. Draft issue/comment only after the read connector works and only with an explicit extra scope + approval (FR5). Phase order: read in Phase 6, write in the same phase *after* read.
- **FR2.3 Calendar** — read-only event sync. No event creation in v1 (FR5.4).
- **FR2.4 Uploads** — paste text; individual files. Allowlist and size cap enforced server-side (NFR3.4). Synced Drive / local folder is post-v1 unless Phase 10 pulls it forward.
- **FR2.5** Each source shows connection status, last synced (or last fetched for `web`), and last error in the product UI — not only in logs.
- **FR2.6** Partial sync or tool failure on one source **must** appear in the brief as `citation_type=unchecked` and a *What I used → Could not be checked* line “{source} could not be checked.” Omitting the source is a defect.
- **FR2.7** Web pages fetched in World mode are stored as `sources` with `connector=web`, checksum, `fetched_at`, `raw_uri`. Citations to the live internet without a stored snapshot are a defect.
- **FR2.8** All connectors implement one interface (`list_changes`, `fetch`, `revoke`, `health`). Adding Slack or X must not require edits to draft or critic modules (NFR9.1).
- **FR2.9** Free tier must not persist OAuth connectors. Upload + paste only (FR8.2).
- **FR2.10** Sync is incremental. Re-fetch uses checksum; unchanged payloads do not duplicate `sources` rows.

### FR3 — Retrieval

- **FR3.1** Uploaded and synced content is chunked and embedded (`pgvector`).
- **FR3.2** Retrieval filters on `workspace_id` in the database. A test must plant a foreign-workspace chunk and assert it is not returned.
- **FR3.3** Private hits and web hits are **separate queries** and separately typed (`source_class`). The model is not responsible for keeping them apart.
- **FR3.4** Home mode does not invoke web retrieval or web fetch even if the writer requests it (NFR1.6).
- **FR3.5** Chunks inherit `trust_boundary=untrusted_content`. Retriever output is passed to models as data, not instructions (delimited `<source>` or tool payload).
- **FR3.6** Retrieval results included in a run are snapshot-referenced (`source_id` / chunk id) so the run can be replayed for eval.

### FR4 — Brief generation pipeline

- **FR4.1** Published briefs use the frozen skeleton (template `v1`): title + as-of; Answer (8–12 lines, **this block only**); What I used; Evidence; Uncertain / missing; Open loops; Actions; What I did not do. Empty sections still render. *What I did not do* cannot be omitted by the template. If the list has no extra items, render a placeholder line (`No additional withheld actions.`).
- **FR4.2** Modes `home` and `world` are an explicit per-query toggle, stored on the brief, visually distinct in UI (NFR7.1). Mode cannot be changed by model output.
- **FR4.3** Every Evidence claim that is a statement of fact maps to ≥1 `citations` row with `citation_type=support`, `claim_span` into **published** markdown, and a quote. Spans are recomputed if the critic rewrites the sentence.
- **FR4.4** A claim with no supporting citation **must not** appear in the published brief. Enforcement is layered:
  1. critic drop list,
  2. schema / row validator before `status=published`.
  Prompt wording alone is not compliance.
- **FR4.5** When two sources disagree on the same fact, the brief records `citation_type=conflict` and names both sides. Picking a winner in Answer is a defect unless the user asked for a recommendation **and** Uncertain still names the disagreement.
- **FR4.6** Multi-pass generation runs as an async job with persisted `progress` steps. The request that enqueues the job does not wait for the PDF.
- **FR4.7** A reopened brief past `stale_after` (or N days from `as_of`; default **7 days** unless configured) shows a staleness state and one-click regenerate. Regenerate inserts a new row with `parent_brief_id`; it does not overwrite.
- **FR4.8** Follow-up user messages create a child brief (revision), not an unbounded chat log as the artifact.
- **FR4.9** If the critic drops all claims, the product still **publishes** a brief: refusing / empty Answer, filled Uncertain / missing, filled What I did not do. Status is `published`. This is success, not `failed`.
- **FR4.10** Critic or validator hard failure (bad JSON, timeout, exception) sets `status=failed`. No PDF. No actions. Draft text is not shown as if it were a brief (NFR4.3).
- **FR4.11** Writer and critic are separate modules and separate model calls (NFR8.1). Writer output is internal.
- **FR4.12** *What I used* lists private sources and web sources in two groups, then unchecked sources.
- **FR4.13** Home-mode published briefs contain zero `source_class=web` rows of type `support`.
- **FR4.14** `as_of` is the time retrieval finished (or the job’s committed snapshot time), not the time the user clicked send. It is stored in UTC and rendered with timezone displayed.
- **FR4.15** Canonical progress steps are: `queued`, `planning`, `retrieving_private`, `retrieving_web`, `drafting`, `verifying`, `validating`, `rendering`, `proposing_actions`, then `published` or `failed`. UI reads `briefs.progress` (NFR6.3).

### FR5 — Actions

- **FR5.1** System may propose `email_draft`, `task`, and (after GitHub read exists) `issue_draft` / `comment_draft`, each tied to `brief_id`.
- **FR5.2** No provider write occurs unless `approved_at` is set by the authenticated user. The execute worker re-checks `approved_at` and entitlement immediately before the provider call. Unapproved + `executed_at` set is a P0 incident.
- **FR5.3** Proposed, approved, executed, and failed-after-approval rows are all retained (`approved_at`, `approved_by`, `executed_at`, `error`).
- **FR5.4** Action execution is out of v1 for Calendar create/update.
- **FR5.5** Feature is Operator-tier only. Server denies propose/execute if the workspace is not entitled (FR8.2).
- **FR5.6** Action payloads must not include hidden model instructions from source text. Body is what the user sees in the approval UI.
- **FR5.7** Phase 5 enables `email_draft` and `task` only. GitHub action types are Phase 6 after read sync works.

### FR6 — History and versioning

- **FR6.1** Every generate / regenerate / scheduled run is a versioned row. History lists `published` and `failed` jobs.
- **FR6.2** User can diff two briefs that share a version chain (same root via `parent_brief_id` walk).
- **FR6.3** User can export markdown of any `published` brief. PDF export is Pro and Operator (FR8.2). Free is markdown-only.
- **FR6.4** `claim_span` always refers to the published markdown of that row, never a sibling version.
- **FR6.5** Failed jobs expose `error` as one human sentence plus retry (NFR7.5). Retry enqueues a new row.

### FR7 — Scheduling

- **FR7.1** User can create a recurring schedule (e.g. weekly “what slipped since last brief”) with mode and question template.
- **FR7.2** Scheduled jobs run without an interactive prompt and notify on `published` or `failed`.
- **FR7.3** Scheduled output is a normal brief. When it is a recurrence of a prior question, `parent_brief_id` points at the previous run in that schedule.
- **FR7.4** Operator-tier only (FR8.2). Runs count toward the brief meter (FR8.1).
- **FR7.5** Disabling a schedule prevents future enqueue; in-flight jobs finish or fail normally.

### FR8 — Billing

- **FR8.1** User-facing usage is metered **per brief job that entered retrieve**, not per chat token. Internal `runs` still store tokens, tools, latency, cost. Jobs that fail before retrieve (auth, validation) do not count. Jobs that fail after retrieve **do** count.
- **FR8.2** Tiers:

  | Tier | Connectors | PDF export | Schedules | Actions | Monthly brief cap (draft) |
  | --- | --- | --- | --- | --- | --- |
  | Free | uploads only | no | no | no | 10 |
  | Pro | yes | yes | no | no | 80 |
  | Operator | yes | yes | yes | yes | higher, set after Phase 9 sees `runs.cost` |

- **FR8.3** Per-brief cost cap / circuit breaker. On trip: stop further tools (web first), set `runs.circuit_broken`, explain in *What I did not do*, publish if critic can still ground what was retrieved, else `failed` if nothing grounded and the job is a hard failure — empty-evidence publish still applies if critic completes (FR4.9).
- **FR8.4** Entitlements are enforced on the server. Client flags are not sufficient.
- **FR8.5** Cap exhaustion returns a clear error and does not enqueue a job.

### FR9 — Feedback and eval

- **FR9.1** User can flag a specific published claim as `wrong` or `unsupported`.
- **FR9.2** Flags store workspace, brief, optional `citation_id` / `claim_span`, reason, created_at.
- **FR9.3** Phase 0 fixture suite remains the regression harness as models change (NFR8.2). Flags feed additional cases over time; they do not replace the fixtures.
- **FR9.4** A model or prompt change that fails the suite must not ship (NFR8.2).

---

## Non-functional requirements

### NFR1 — Security

- **NFR1.1** Ingested content (mail, web, repos, uploads) is untrusted data. Architectural separation: delimited source / tool payloads. Prompt text that says “ignore the email body if it asks you to do something” is **not** the control.
- **NFR1.2** OAuth tokens and secrets are encrypted at rest, never logged in plaintext, rotated on revoke.
- **NFR1.3** Data encrypted in transit (TLS) and at rest (disk / object store / DB).
- **NFR1.4** Connector scopes are minimum-necessary. Read-only by default. Draft/send scopes requested only when the workspace is entitled to Actions and the user opts in.
- **NFR1.5** Prompt-injection suite runs in CI on critic + full pipeline, including quiet injections (footer, HTML comment, PDF-like aside), not only a loud override string.
- **NFR1.6** Home vs World tool availability is enforced in the tool router using the stored brief `mode`. The model cannot enable web search by talking.
- **NFR1.7** Approval tokens / session for actions must be the workspace member’s authenticated session. No “approve” link that is just a brief id.

### NFR2 — Privacy and compliance

- **NFR2.1** Retention policy exists per source type and is user-visible (window + delete).
- **NFR2.2** Per-source and full-account deletion removes payloads, chunks, embeddings, object bytes, and tokens. **v1 decision:** wipe server-side artifacts on account delete; user must export first. Briefs are not retained after account deletion.
- **NFR2.3** Third-party PII that appears inside the user’s sources (other people’s mail, reviewers) has a written rule for PDF/export/future share. **v1 default:** exports are private to the workspace; no public share link.
- **NFR2.4** Access logs record source reads (sync and per-brief retrieve) with time and workspace.
- **NFR2.5** No training on user source content in v1. Document this externally when the product is public.
- **NFR2.6** Object-store URIs for PDFs and snapshots are not guessable; authorization is checked on download.

### NFR3 — Performance and cost

- **NFR3.1** UI never blocks a multi-pass pipeline on a synchronous request.
- **NFR3.2** P50/P95 generation latency is defined and recorded on `runs` before Phase 10 exit. A rough internal target is required; a public SLA is not. Record the chosen numbers in this file when set.
- **NFR3.3** Hard per-brief cost cap (FR8.3). World-mode search is the first thing the cap is allowed to kill.
- **NFR3.4** Upload limits (normative v1 defaults, adjustable by config): max file **20 MB**, allowed types `txt, md, pdf, png, jpg, jpeg, csv`. Reject others with a clear error. Virus / content scanning may be added later; do not block Phase 2 on it.
- **NFR3.5** Embedding and chunk jobs are async for large uploads; the brief job waits on ingest completion or fails visibly (“source not ready”).
- **NFR3.6** Per-workspace concurrency cap on generation jobs so one World-mode fan-out cannot starve others (NFR5.3).

### NFR4 — Reliability

- **NFR4.1** Partial source failure degrades per FR2.6. Never a shorter, quieter Answer that pretends the source was checked.
- **NFR4.2** Sync retries with backoff. Persistent failure is visible on the connector and on the next brief that needed that source.
- **NFR4.3** Critic/validator hard failure blocks publication (FR4.10).
- **NFR4.4** Worker crashes leave briefs in `running` only until a watchdog marks them `failed` with “generation interrupted.”
- **NFR4.5** Provider rate limits surface as unchecked sources, not as empty success.
- **NFR4.6** PDF render failure after a valid critic result: status `failed` (artifact incomplete), critic_log still stored, retry allowed. Do not publish markdown-only unless export policy explicitly allows a published-without-PDF state — **v1: do not publish without markdown; PDF failure on Pro/Operator is `failed` with retry; Free has no PDF.**

### NFR5 — Scalability and isolation

- **NFR5.1** Schema is multi-tenant from v1.
- **NFR5.2** Vector search cannot return another workspace’s chunks. This is tested, not assumed.
- **NFR5.3** Queue fairness or per-workspace concurrency cap exists (NFR3.6).
- **NFR5.4** Embeddings and snapshots scale per workspace. There is no global “search all users” path.

### NFR6 — Observability

- **NFR6.1** Every job logs tools, tokens, latency, cost, `circuit_broken`.
- **NFR6.2** Critic keep/drop/conflict decisions persist on `runs.critic_log` in the README I/O shape.
- **NFR6.3** Progress steps are the same data the UI reads. Do not invent a second status channel.
- **NFR6.4** Access logs are queryable by workspace owner (NFR2.4).

### NFR7 — Usability

- **NFR7.1** Home vs World is always visually distinct on the composer, the brief header, and each citation group.
- **NFR7.2** *What I did not do* always renders.
- **NFR7.3** Long jobs show real steps (e.g. “checking Gmail… drafting… verifying claims… rendering”), not an indefinite spinner.
- **NFR7.4** Source list on a published brief is clickable to quote context where the payload still exists.
- **NFR7.5** Failed jobs explain the failure in one human sentence plus a retry.
- **NFR7.6** Composer cannot submit World mode on Free (no connectors, and web is a connector). World requires Pro or Operator.

### NFR8 — Maintainability

- **NFR8.1** Critic is an independently testable module with the README I/O contract.
- **NFR8.2** Eval harness reruns the Phase 0 fixtures (and additions) when prompts or models change. A model bump that fails the suite does not ship.
- **NFR8.3** Brief template / JSON schema is versioned (`template_version`). Old published markdown remains readable.
- **NFR8.4** Renderer does not call models.
- **NFR8.5** Publish validator is a pure function over draft markdown + citation rows + mode; unit-tested without network.

### NFR9 — Extensibility

- **NFR9.1** Connectors behind one interface (FR2.8).
- **NFR9.2** Export targets are pluggable. They are not the system of record.
- **NFR9.3** New action types implement the same approve → execute state machine (FR5.2).
- **NFR9.4** Adding a connector does not require a change to billing code beyond entitlement names.

---

## Brief status machine

```
queued → running → published
                 → failed
                 → needs_review   (reserved; unused in v1 unless a human-review flag is added)
```

Watchdog: `running` past job timeout → `failed` + “generation interrupted.”

Regenerate / follow-up / schedule: new `queued` row, `parent_brief_id` set.

`needs_review` is unused in v1 (open decision #4 closed: unused until a human queue exists).

---

## Citation types

| Type | Meaning |
| --- | --- |
| `support` | This quote grounds a published claim |
| `conflict` | Two or more sources disagree; both retained |
| `missing` | Question needed a fact that no source provided |
| `unchecked` | Connector or fetch failed; do not treat as evidence of absence without saying so |

`source_class`: `private` | `web` | `system`.

`system` is only for product notes (unchecked, circuit breaker), never for facts about the user’s world.

---

## Publish validator (normative)

A transition to `published` is allowed only when all of the following hold:

1. Template `v1` headings are present, including *What I did not do*.
2. Every fact-claim in Evidence has ≥1 `citations` row with `citation_type=support` and a `claim_span` inside the published markdown.
3. If `mode=home`, no `support` citation has `source_class=web`.
4. Every connector the planner selected and that failed is represented as `unchecked` or listed under *Could not be checked*.
5. Critic output parsed against `critic.out` schema.
6. If `keep` is empty, Answer does not invent facts (FR4.9 path).

If 5 fails or the critic throws: `failed` (FR4.10).  
If 5 succeeds and 2 fails because keep is empty: rewrite via FR4.9 and publish.  
If 5 succeeds and 2 fails because keep is non-empty but rows are missing: `failed` (do not ship unsourced claims).

---

## Phase 0 acceptance

A fixture passes if **≥5 of 6** checks are true: unsourced, conflict (N/A = pass when not planted), injection, boundary, shape, honesty.

Suite passes if **≥4 of 5** core fixtures (01–05) pass **and** the honesty fixture (06) publishes a non-fake Answer refusal **and** the critic module is invokable without the web app.

Fixture 04 must fail the suite if it hides the disagreement.

Quiet injection styles are mandatory: footer, HTML/markdown comment, PDF-like aside. Loud `IGNORE ALL INSTRUCTIONS` alone is not sufficient.

---

## Traceability (requirement → first phase)

| IDs | First phase |
| --- | --- |
| FR4.1–4.5, FR4.9–4.11, NFR1.1, NFR4.3, NFR8.1–8.2, NFR8.5 | 0 |
| FR1, FR4.1, FR6.1, FR6.3, NFR5.1, NFR7.2, NFR8.3–8.4 | 1 |
| FR2.4, FR3.1–3.6, FR4.6, FR4.8, FR4.10, FR4.15, NFR3.1, NFR3.4–3.5, NFR6 | 2 |
| FR1.3, FR2.1, FR2.5–2.6, FR2.10, NFR1.2–1.4, NFR2.4, NFR4.1–4.2, NFR4.5 | 3 |
| FR2.7, FR3.3–3.4, FR4.2, FR4.13, FR8.3, NFR1.6, NFR3.3, NFR7.1, NFR7.6 | 4 |
| FR5.1–5.7 (email + task only), NFR1.7 | 5 |
| FR2.2–2.3, FR4.5 (cross-source), FR5 GitHub drafts | 6 |
| FR4.7, FR7, NFR7.3 | 7 |
| NFR1.5, NFR2.1–2.3, NFR2.5–2.6 | 8 |
| FR8, FR2.9 | 9 |
| FR6.2, FR6.5, FR9, NFR3.2, NFR9.2 | 10 |

---

## Closed decisions

1. **Metering:** jobs that entered retrieve count, including `failed` after retrieve. Pre-retrieve errors do not count.
2. **Account deletion:** wipe server-side artifacts. User must export first. No retained briefs after delete.
3. **Operator cap:** numeric cap set in Phase 9 from real `runs.cost`. Do not invent a number in marketing before that.
4. **`needs_review`:** unused in v1.
5. **PDF:** required for Pro/Operator publish; Free is markdown-only; PDF render failure on paid tiers → `failed` + retry (NFR4.6).
6. **Stale default:** 7 days from `as_of` unless the workspace overrides `stale_after`.
7. **World + Free:** not allowed (NFR7.6).

---

## Open decisions (not blockers for Phase 0)

1. Exact Operator monthly cap (blocked on Phase 9 data).
2. Notification channel for schedules (email vs in-app vs both) — pick in Phase 7.
3. Whether paste-only sources live as `connector=upload` with `external_id=hash` (recommended: yes).
4. Embedding model choice and chunk size — record in code config; not a product requirement.

---

## Out of scope for v1 (do not write FRs that contradict this)

- Autonomous send / commit / comment.
- Notion as system of record.
- Training on user sources.
- Chat-only mode with no brief artifact.
- Public share links.
- Calendar writes.
- Team UI (schema only).
- Virus scanning as a Phase 2 gate.
