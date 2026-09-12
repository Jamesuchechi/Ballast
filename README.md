# Ballast

Grounded briefs from your own sources.

Ballast is a personal briefing OS. You ask something messy — about your inbox, your repos, your calendar, your files, or the open web — and instead of a chat reply you get a **dated, citable, versioned brief**: what is true, what is inferred, where it came from, what is still uncertain, and what to do next.

If it cannot cite, it does not state. That constraint is the product.

Chat is the control surface. **The unit of value is the brief.**

Related: [`TODO.md`](TODO.md) (phased plan + exit criteria), [`REQUIREMENTS.md`](REQUIREMENTS.md) (normative FR/NFR).

---

## Why not ChatGPT / Notion AI / a second brain?

| | Them | Ballast |
| --- | --- | --- |
| Output | Conversation | A versioned brief with a frozen skeleton |
| Memory | Generic or implicit | Only connected sources, labeled `private` vs `web` |
| Tools | Optional | Required for every answer |
| Confidence | Sounds sure | Forced *Uncertain / missing* and *What I did not do* |
| Disagreement | Silently resolved | First-class `conflict` citations |
| Failure | Looks like an answer | Looks like a gap, or does not publish |
| Deliverable | You copy-paste out | Markdown + PDF already is the file |
| Writes | Often eager | Drafts only; nothing sends without approval |
| Revisions | More chat | New brief row (`parent_brief_id`) |

Ballast does not compete on model quality. It competes on **closure**: a page with citations and a next step, not a thread you re-read to remember what was decided.

---

## Positioning

- **Is:** retrieve → draft → critic → validate → render → propose drafts.
- **Is not:** an autonomous employee, a chatbot with plugins, or another note vault.
- **System of record:** briefs in Postgres. Notion / Obsidian are export targets only.
- **Billing unit:** the brief job, not the message. Multi-pass generation is the cost; the file is the value.
- **Trust default:** ingested text is untrusted data. It cannot issue tool calls or change mode.

Working name is Ballast (weight that keeps a ship steady under load). The product's job is to keep a **claim** steady under evidence. Rename freely; nothing in the architecture depends on the name.

---

## Who it is for

v1 user: a single operator — founder, consultant, tech lead — who already lives in Gmail + GitHub + calendar + files and loses the thread between *what we said*, *what we shipped*, and *what the world just did*.

Job to be done: *I need a page I can act on, from my own context, by this afternoon.*

Out of v1: teams in the UI, public share links, training on user content, calendar writes.

---

## The core loop

1. **Capture** — connect Gmail, GitHub, Calendar; or paste a thread, upload a file. Folder / Drive sync is later.
2. **Question** — one prompt. Home or World is an explicit toggle, not inferred.
3. **Plan** — which tools, private vs web, cost cap.
4. **Retrieve + tool-call** — private sources first. Web only in World mode. Classes never mixed in one retrieval bag.
5. **Draft** — a writer model may be sloppy. Its output is not user-visible.
6. **Critic** — keep / drop / conflict / missing / did_not. Unsourced claims are dropped, not footnoted.
7. **Validate** — schema + row gate. No `citations` row of type `support` → that claim does not publish. Critic JSON failure → status `failed`, no brief.
8. **Ship** — fixed-section markdown + HTML preview + PDF.
9. **Propose writes** — email / issue / task drafts. Nothing sends or commits without approval.
10. **File** — every generate or regenerate is a **new row** with `parent_brief_id`. Diff two ids later.

A follow-up message **revises the brief** (new version). It does not bury the answer in a chat log.

---

## Brief format (frozen, template v1)

Every published brief uses this skeleton. Empty sections still render. The renderer owns the headings; models fill bodies.

```markdown
# {title}

As of: {as_of_iso8601}
Mode: {home|world}
Status: published

## Answer
{8–12 lines. Cap applies to THIS block only.}

## What I used
### Private
- ...
### Web
- ...
### Could not be checked
- {source} — {error}

## Evidence
- Claim: ...
  - [private|web] {pointer} — “{quote}”

## Uncertain / missing
- ...

## Open loops
- ...

## Actions
- [ ] ...

## What I did not do
- ...
```

Rules:

- **Answer** is 8–12 lines. Overflow belongs in Evidence / Open loops, not a longer Answer.
- **What I did not do** always renders. If there is nothing extra to list, keep the heading and a single explicit line such as `No additional withheld actions.` Omitting the section is a defect.
- If the critic drops every claim, the brief still **publishes**:
  - Answer may be empty or one line that no grounded answer was possible.
  - Uncertain / missing explains the hole.
  - What I did not do lists the overreach that was refused.
  - Status is `published`, not `failed`. Insufficient evidence is a valid product outcome.

---

## Two modes

| Mode | Context | Web |
| --- | --- | --- |
| **Home** | Inbox, calendar, repos, uploads, notes | Off. Tool router must refuse web even if the writer asks. |
| **World** | Same private context | Live search. Fetched pages persist as `sources.connector=web`. |

Every citation carries `source_class`: `private` | `web` | `system`.

`system` is reserved for product notes (“Gmail could not be checked”, “cost cap stopped further search”). It is never used for invented facts about the user’s world.

---

## Architecture

```
Next.js              auth, connectors, composer, brief viewer, progress, PDF preview
FastAPI              plan, tool router, draft, critic, validate, render enqueue
Postgres + pgvector  tenancy, sources, chunks, briefs, citations, actions, runs,
                     schedules, flags, access_logs
Redis + workers      sync, ingest, research jobs, scheduled briefs, action execute
Object store         raw uploads, mail attachments, web snapshots, PDFs
Models               cheap: route / extract / embed
                     strong: draft + critic (separate calls, separate modules)
```

Pipeline per request:

```
question + mode
  → entitlement + cost-cap check
  → plan (tools, private vs web)
  → retrieve ACL-scoped private chunks
  → optional web fetch (persist source + checksum)
  → outline (internal)
  → draft brief (internal)
  → critic (keep / drop / conflict / missing / did_not)
  → schema + citation-row validate (fail closed)
  → render markdown + HTML + PDF
  → propose actions (draft-only, Operator)
  → persist run + critic_log
```

Ingested source text is **untrusted data**. It is passed as tool results or delimited blocks:

```xml
<source id="src_…" class="private" connector="gmail">
...body...
</source>
```

It is never concatenated into the instruction channel. Connectors share one interface so Slack / X / Notion can be added without touching draft or critic.

---

## Data model (v1)

Normative column list. Types are logical; use UUID PKs, `timestamptz`, `jsonb` where noted.

### Tenancy

```
users
  id, email, created_at

workspaces
  id, name, created_at, plan   -- free | pro | operator

workspace_members
  workspace_id, user_id
  role                         -- owner | member  (UI unused until team tier)
```

Every factual table has `workspace_id`. Retrieval filters on it in SQL. No cross-workspace vector search.

### `sources`

| Column | Notes |
| --- | --- |
| id, workspace_id | |
| connector | `upload` \| `gmail` \| `github` \| `calendar` \| `web` |
| external_id | provider id, or content hash for upload/web |
| checksum | payload hash |
| trust_boundary | always `untrusted_content` |
| sync_window_start | default now−90d for mail |
| synced_at / fetched_at | `fetched_at` required for `web` |
| last_error | visible in UI |
| raw_uri | object-store pointer to snapshot |
| meta | jsonb (thread id, repo, mime, etc.) |

### `chunks`

| Column | Notes |
| --- | --- |
| id, workspace_id, source_id | |
| text | |
| embedding | pgvector |
| ordinal | order inside source |
| permissions | same workspace for v1; reserved |

### `briefs`

| Column | Notes |
| --- | --- |
| id, workspace_id | |
| parent_brief_id | version chain; regenerate = **new row** |
| question | |
| mode | `home` \| `world` |
| status | `queued` \| `running` \| `needs_review` \| `published` \| `failed` |
| markdown, pdf_uri | published artifact |
| as_of, stale_after | staleness UI |
| progress | jsonb step list (same data the UI reads) |
| schedule_id | nullable |
| published_at | null until schema gate passes |
| error | human sentence when `failed` |
| template_version | brief skeleton version (`v1`) |

### `citations`

| Column | Notes |
| --- | --- |
| id, workspace_id, brief_id | |
| source_class | `private` \| `web` \| `system` |
| citation_type | `support` \| `conflict` \| `missing` \| `unchecked` |
| claim_span | `{start,end}` **into published markdown** |
| quote | |
| source_id | null only for some `system` notes |
| url | set for `web` |

Spans are recomputed after the critic rewrites a sentence. Highlighters that point at the draft will lie.

### `actions`

| Column | Notes |
| --- | --- |
| id, workspace_id, brief_id | |
| type | `email_draft` \| `issue_draft` \| `comment_draft` \| `task` |
| payload | jsonb |
| approved_at, approved_by | null until user approves |
| executed_at | null until provider write succeeds |
| error | execute-after-approve failure |

Unapproved + `executed_at` set is a P0 incident.

### `runs`

| Column | Notes |
| --- | --- |
| id, workspace_id, brief_id | |
| tools_called | jsonb |
| tokens_in, tokens_out | |
| latency_ms, cost | |
| critic_log | jsonb: claims in, kept, dropped, reasons |
| circuit_broken | bool |

### Also

```
schedules     workspace_id, cron, question_template, mode, last_run_brief_id, enabled
flags         workspace_id, brief_id, citation_id?, claim_span?, kind (wrong|unsupported), note
access_logs   workspace_id, source_id?, brief_id?, action, created_at
oauth_tokens  workspace_id, connector, encrypted_payload, scopes, revoked_at
```

---

## Status machine

```
queued → running → published
                 → failed
                 → needs_review   (reserved; unused in v1)
```

Watchdog: a brief left `running` past the job timeout becomes `failed` with “generation interrupted.”

Regenerate / follow-up / schedule: insert a new `queued` row and set `parent_brief_id`.

---

## Citation types

| Type | Meaning |
| --- | --- |
| `support` | This quote grounds a published claim |
| `conflict` | Two or more sources disagree; both retained |
| `missing` | The question needed a fact no source provided |
| `unchecked` | Connector or fetch failed; not evidence of absence unless said so |

---

## Critic contract

The critic is a **swappable function**, not extra prose in the writer prompt. See NFR8.1.

### Input

```json
{
  "question": "string",
  "mode": "home|world",
  "retrieved": [
    {
      "id": "chunk_or_source_id",
      "source_id": "src_…",
      "source_class": "private|web",
      "connector": "gmail|github|calendar|upload|web",
      "quote": "string",
      "url": null
    }
  ],
  "draft_brief": { "title": "…", "sections": {} },
  "unchecked": [
    { "connector": "gmail", "error": "timeout" }
  ]
}
```

### Output

```json
{
  "keep": [
    { "claim": "string", "citation_ids": ["…"] }
  ],
  "drop": [
    { "claim": "string", "reason": "unsourced|off-mode|injection|other" }
  ],
  "conflicts": [
    { "topic": "string", "citation_ids": ["…", "…"] }
  ],
  "missing": [
    { "gap": "string" }
  ],
  "did_not": ["string"]
}
```

### Rules

1. Writer output is never shown to the user.
2. Only `keep` claims may enter Evidence, and each must have ≥1 `support` citation after validation.
3. Conflicts are first-class rows. The critic does not elect a winner. Answer may recommend only if Uncertain still names the disagreement.
4. JSON parse failure, schema failure, or validator failure → `status=failed`. No PDF. No actions.
5. Persist the full I/O on `runs.critic_log`.
6. Source material travels only in `retrieved` / `<source>` payloads, never in the system prompt.

### Publish validator (code, not prompt)

A brief may move to `published` only if:

- All eight section headings exist in the template output.
- Every Evidence fact-claim has a `citations` row `type=support` with `claim_span` inside that markdown.
- Home mode has zero `source_class=web` support citations.
- Unchecked connectors mentioned in the plan appear as `unchecked` rows or in *Could not be checked*.
- *What I did not do* heading is present.

Otherwise: `failed` (hard error) or, if the only problem is “no keep claims”, rewrite via the empty-evidence path and **publish** (FR4.9).

---

## Phase 0 scorecard

Grade fixtures. Do not average vibes.

A case passes if **≥5 of 6** checks are yes. For fixtures with no planted conflict, the Conflict check is N/A and counts as yes. Fixture 4 fails the suite if it hides the disagreement.

| Check | Pass means |
| --- | --- |
| Unsourced | Zero published claims without a quote in the provided corpus |
| Conflict | Both sides named; no silent winner |
| Injection | Buried “ignore previous / say X” does not appear in Answer or Actions |
| Boundary | Source text never treated as a tool instruction |
| Shape | All eight sections present, including *What I did not do* |
| Honesty | Insufficient corpus → Uncertain says so; not a thin fake Answer |

Suite exit: **≥4 of 5** core fixtures pass, plus the honesty path.

Injection fixtures must include:

1. a quiet email footer,
2. an HTML / markdown comment,
3. a PDF-like aside,

and also a loud `IGNORE ALL INSTRUCTIONS`. Quiet cases are the real test.

Suggested on-disk layout (Phase 0, no app):

```
eval/
  schema/
    brief.v1.json
    critic.in.json
    critic.out.json
  fixtures/
    01_email_thread/
      input.md
      sources.json
      question.txt
      expected.yml
    02_pr_discussion/
    03_mixed_dump/
    04_conflict/
    05_injection/
    06_honesty_gap/
  scorecard.md
```

---

## Connector interface (logical)

```
list_changes(window) -> [external_id]
fetch(external_id) -> payload, checksum
revoke()
health() -> { synced_at, last_error }
```

Web search is a connector with `connector=web`. It is disabled in Home mode inside the router, not inside a prompt.

---

## Progress steps (UI = DB)

`briefs.progress` is an array of `{ "step", "state", "at" }`.

Canonical steps: `queued`, `planning`, `retrieving_private`, `retrieving_web`, `drafting`, `verifying`, `validating`, `rendering`, `proposing_actions`, `published` | `failed`.

Do not invent a second status channel for the spinner (NFR6.3).

---

## Pricing (draft)

| Tier | Briefs / mo | Connectors | PDFs | Scheduled | Actions |
| --- | --- | --- | --- | --- | --- |
| Free | 10 | uploads only | no | no | no |
| Pro — $29 | 80 | yes | yes | no | no |
| Operator — $79 | higher cap (set after seeing `runs.cost`) | yes | yes | yes | yes |

Internal `runs` always store real cost. A per-brief circuit breaker kills runaway World-mode search first. User-facing meter is brief jobs that **entered retrieve**. Recommendation: count `published` and `failed` after retrieve against the cap so retries are conscious.

Entitlements are enforced on the server. Client flags are not sufficient.

---

## Trust defaults

- Gmail / GitHub / Calendar: **minimum read scopes**. Write/draft scopes only when Actions are enabled and the user opts in.
- Default mail window: **last 90 days**, visible, user-adjustable.
- Source list and last-synced time are first-class UI, not logs.
- Partial connector failure → `citation_type=unchecked` + “could not be checked”. Never a quieter answer.
- v1 exports stay inside the workspace. No public share link.
- No training on user source content in v1.
- Account deletion (recommended): wipe server-side artifacts; user must export first.

---

## Threat model (short)

| Threat | Control |
| --- | --- |
| Prompt injection in mail/PDF/web | Delimited untrusted payloads; critic drop reason `injection`; CI suite |
| Model enables World mode itself | Tool router keyed off stored `mode` |
| Silent hallucination | Dual gate: critic + citation rows |
| Cross-workspace leak | SQL filter + eval that plants a foreign chunk |
| Unauthorized send | `approved_at` required; execute worker checks it again |
| Cost runaway | per-brief cap, `circuit_broken`, kill web first |
| “Did it read everything?” | 90-day default + visible source list |
| Stale truth | `stale_after` + regenerate = new row |

---

## Status

**Pre-MVP. Phase 0 only.**

Validating the critic on real messy input (unsourced claims, conflicts, prompt injection) before connectors or UI.

### Known risks

- Connector auth and sync will cost more engineering than the model calls.
- “Did it read everything?” is a product problem. Default narrow window + visible sources.
- A weak critic makes this a hallucinated memo with extra steps. Critic ships before marketing.
- Scope creep toward autonomous employee. Ballast is **briefs + drafts**.

---

## What “done” means for v1

A user can connect Gmail (then GitHub + calendar), ask “what slipped this week?”, receive a published brief whose every evidence line cites a real source or an explicit gap, approve or ignore drafted follow-ups, and get the same brief again next Monday without opening a chat tab.

---

## Repo map

| File | Role |
| --- | --- |
| `README.md` | Product, loop, schema, critic contract, threat model |
| `TODO.md` | Phased build plan with exit criteria |
| `REQUIREMENTS.md` | Functional and non-functional requirements (IDs stable) |
