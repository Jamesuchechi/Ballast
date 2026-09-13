# Task: De-mock Ballast and make it a real, scalable connector platform

## Context (read this before touching anything)

Ballast's TODO.md marks Phases 0–4 as complete. They are not. The checkmarks were earned against a deterministic fallback path passing its own eval suite, not against real external systems or a real model. Specifically, audited and confirmed in the current codebase:

1. `src/connectors/gmail.ts` — `list_changes()` and `fetch()` ignore the OAuth token entirely and always return the hardcoded `SAMPLE_GMAIL_MESSAGES` array. There is no call to the Gmail API anywhere.
2. `src/app/api/connectors/gmail/auth/route.ts` — silently drops into mock mode (`isMock = !clientId`) whenever `GOOGLE_CLIENT_ID` is unset, with no warning surfaced anywhere.
3. `src/core/writer.ts` and `src/core/critic.ts` both accept an optional `llmCall` param, but `src/core/pipelineWorker.ts` invokes both **without ever passing one**. Every brief ever generated came from `generateDeterministicDraft()` (string templating) and `evaluateCriticDeterministic()` (regex + word-overlap matching), not from a model.
4. `src/core/embeddings.ts` — `generateEmbedding()` is a hash-based bag-of-words projection, not a real embedding model. "Retrieval" is keyword overlap dressed as pgvector search.
5. `src/app/api/briefs/enqueue/route.ts` — the "async job pipeline" is a `setTimeout(..., 10)` in the same process. Redis is provisioned in `docker-compose.yml` and unused.
6. `src/app/app/page.tsx` — connections UI is one hardcoded "Gmail Connector Card" block (~2400-line page file). There's no reusable connector component, no registry, no way to add a new integration without hand-copying that block.
7. `src/app/api/actions/[id]/approve/route.ts` — approval just sets `approved_at`; nothing ever calls a provider to actually send anything. (This one is honestly marked `[ ]` in TODO.md — leave the honesty, just build it.)

## Non-negotiable rules for this pass

- **No silent mock fallbacks in production code paths.** If a required key/token is missing, fail loudly with a clear error surfaced to the UI — never return canned/sample data as if it were real. Mock/sample data is allowed **only** behind an explicit `EVAL_USE_MOCK=true` or `NODE_ENV=test` gate, never as an implicit default.
- **Do not re-check a TODO.md box unless the exit criterion is demonstrated on real external data** — a real Gmail inbox, a real model response, a real queued job that survives a process restart. This is literally the rule already written in TODO.md's "Definition of phase complete" — follow it this time.
- Keep the existing architecture and interfaces where they're sound (`SourceConnector` type in `src/connectors/types.ts`, the brief/critic JSON contracts in `eval/schema/`, the Postgres schema). This is a de-mocking and extension pass, not a rewrite.
- After each phase below, run the Phase 0 eval suite (`eval/runner.ts`) and paste the actual output before moving to the next phase. A real LLM is non-deterministic — if the suite regresses, fix the critic/prompt, don't lower the bar.

## Phase A — Real multi-provider LLM layer

Build `src/core/llm.ts`: a router that takes provider keys from env (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`) and exposes one `llmCall(prompt, systemPrompt, opts?)` function with:
- An explicit fallback order (try Gemini → OpenRouter → Groq → Mistral, configurable), used only on provider error/timeout, not silently on missing key.
- Distinguish the **writer** call from the **critic** call — critic should default to a cheaper/faster model (e.g. Groq) since it's a structured-output verification pass, not creative generation; writer can use the strongest available model.
- Timeout + retry with backoff, and a typed error that bubbles up to the pipeline as `failed` with a real message — not a silent fallback to the deterministic path.
- Wire it into `pipelineWorker.ts` so `runWriter` and `runCritic` are called **with** `llmCall`.
- Keep `generateDeterministicDraft` / `evaluateCriticDeterministic` as the explicit fallback used ONLY in eval/CI mode — rename them or gate them so it's obvious they're the test path, not the product path.

## Phase B — Real Gmail, and a real connector framework (not just Gmail)

1. Fix `gmail.ts` to actually call the Gmail API (`googleapis` package) using the decrypted token from `tokenStore.ts` — real `list_changes` (Gmail `messages.list` with query for the date window) and real `fetch` (`messages.get`). Handle token refresh.
2. Remove the silent `!clientId` mock fallback in `auth/route.ts`. If unconfigured, return a clear "Gmail not configured" state to the UI, not a fake connection.
3. Generalize the connector interface (it already exists in `types.ts` — use it) into a **registry**: `src/connectors/registry.ts` exporting an array of connector definitions (id, name, icon, scopes, auth type). Add real connectors beyond Gmail/GitHub for: Google Calendar (read), Google Drive (read), Slack (read channels/messages), Notion (read pages/databases). Each should follow the same `SourceConnector` shape and real API pattern as the fixed Gmail connector — no placeholder sample-data connectors.
4. GitHub: same treatment — read repos/PRs/issues for real via the GitHub REST/GraphQL API, OAuth token stored the same encrypted way as Gmail.

## Phase C — Real embeddings

Replace `generateEmbedding()` with a real embedding call — use whichever of the four provider keys exposes an embeddings endpoint (e.g. Gemini's embedding model, or Mistral's), or fall back to a local model via `@xenova/transformers` if you want zero API cost for embeddings. Keep the 1536-dim (or whatever the chosen model's native dim is — update the pgvector column if it changes) and re-embed existing chunks with a migration script.

## Phase D — Real async job queue

Add BullMQ against the existing Redis container. Replace the `setTimeout` in `enqueue/route.ts` with a real queue producer, and turn `processQueuedBrief` into a real worker process (`npm run worker`) with retry, concurrency limits, and job persistence across restarts. Update `docker-compose.yml`/`package.json` scripts accordingly.

## Phase E — Rebuild the connections UI (this needs to look and feel like a real product)

Replace the hardcoded Gmail card in `page.tsx` with:
- A generic `<ConnectorCard>` component driven by the Phase B registry — same component renders Gmail, GitHub, Calendar, Drive, Slack, Notion, etc.
- A "Connections" view styled like a real integrations marketplace: grid of available connectors with logo, one-line description, Connect/Connected/Error states, last-synced time, and a real health indicator (not just connected/disconnected — surface `last_error` from the DB, which already exists in the schema).
- An "Add connection" flow that's the same OAuth pattern for every provider, not hand-built per integration.
- Follow the existing app's visual system (check `src/components/dashboard` for the current design tokens) — this should look like a first-class part of the product, not a bolted-on settings page.

## Phase F — Real action execution

Implement the actual Gmail send in the approval flow: worker re-checks `approved_at` + entitlement, then calls the Gmail API `messages.send` (or `drafts.create` if that's the intended UX), records `executed_at`/`error`. Add the automated test already specified in TODO.md Phase 5: unapproved draft never calls send.

## Deliverable at the end

1. Updated `TODO.md` reflecting the true state — only check boxes proven against real data/models, with a note on what's proven vs. what's still deterministic-only.
2. A short summary of what you changed per phase, and the eval suite output before/after Phase A specifically (since a real model changes non-deterministic behavior).
3. Flag anything you could not wire up for real (e.g. a provider needing a paid tier or app-review approval) instead of quietly mocking it.

Work phase by phase, in the order above (A → F). Do not start a phase until the previous one's real-data check passes — same discipline the project's own TODO.md already asks for.