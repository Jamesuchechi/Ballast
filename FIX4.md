# Task: Fix the Vercel serverless import crash, then work the improvement backlog

## Part 1 — The bug (do this first, it's production-breaking)

### Root cause

`src/storage/objectStore.ts` executes filesystem work **at module load time**, not inside a
function:

```ts
const STORAGE_ROOT = path.resolve(process.cwd(), '.storage');
if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });   // throws EROFS on Vercel
}
```

Vercel's serverless filesystem is read-only except `/tmp`, so `mkdirSync` throws the instant this
module is imported. Any route that pulls it into its bundle 500s on cold start, before the route
handler runs — which is why the error surfaces with no useful message.

`POST /api/schedules/[id]/run` hits this via a dead import chain:

```
route → runSchedule (@/core/scheduler)
      → import { processQueuedBrief } from './pipelineWorker'   ← the culprit
      → renderAndStorePdf (./pdfRenderer)
      → objectStore  → 💥 mkdirSync at module scope
```

The previous commit removed the *inline execution* from `runSchedule` but left the **import**.
In JS the import alone is enough to bundle and initialise the whole pipeline. And it's dead
weight: `processQueuedBrief` is only referenced by the `runSynchronously` option, which nothing
in the codebase ever passes (verify with grep before deleting).

`GET /api/briefs/[id]/pdf` imports `objectStore` and `pdfRenderer` directly, so **it is broken in
production right now for the same reason** — confirm this and fix it in the same pass.

### Fix 1a — Remove the dead import from the scheduler

In `src/core/scheduler.ts`: delete `import { processQueuedBrief } from './pipelineWorker';`,
delete the `options?: { runSynchronously?: boolean }` parameter, and delete the
`if (options?.runSynchronously)` branch, leaving only the `enqueueBriefJob(...)` dispatch. Grep
for `runSynchronously` first to confirm no caller passes it.

### Fix 1b — Make objectStore safe to import anywhere

- Choose the storage root by environment: `/tmp/.storage` when `process.env.VERCEL` is set,
  `path.resolve(process.cwd(), '.storage')` otherwise.
- Move `mkdirSync` out of module scope into a lazy `ensureStorageRoot()` that the read/write
  functions call. **Importing the module must never touch the filesystem.** Apply the same audit
  to any other module with top-level `fs` calls.
- Note for context (don't try to solve it here): on Vercel `/tmp` is ephemeral and per-instance,
  so anything written there won't persist. That's acceptable because PDF *generation* only runs
  on the Render worker, which has a real disk. The `/tmp` path exists purely so the import stops
  crashing. See Part 2 item 1 for the real fix.

### Fix 1c — Enforce the boundary so this can't recur

The architectural invariant is: **Vercel API routes enqueue work; the Render worker executes it.**
No route under `src/app/api/` should import anything from the execution pipeline
(`pipelineWorker`, `pdfRenderer`, `objectStore`, `writer`, `critic`, `embeddings`, `llm`).

- Run `grep -rn "pipelineWorker\|pdfRenderer\|objectStore\|embeddings\|core/llm" src/app/api/`
  and fix every hit.
- Add an ESLint `no-restricted-imports` rule (scoped to `src/app/api/**`) that fails the build on
  these imports, so the next violation is caught at build time instead of as a production 500.

### Verify

After deploying: "Run now" on a schedule returns 202 and the job appears in the Render worker
logs; the PDF download route returns a file instead of a 500. Confirm both against production,
not just locally — this class of bug doesn't reproduce in `next dev`, which has a writable disk.

---

## Part 2 — Improvement backlog

These are real gaps found while auditing, ordered by importance. Work them after Part 1 ships and
is verified. Treat each as its own commit. If any turns out bigger than expected, stop and flag it
rather than half-landing it.

### 1. Object storage doesn't survive deploys (highest-value fix)

`objectStore` writes to local disk. On Render, that disk is wiped on every deploy and restart —
so **every generated PDF silently disappears whenever you push a change**, and `pdf_uri` rows
point at files that no longer exist. Any user clicking an older brief's PDF gets an error.

Move to real object storage: Cloudflare R2 (S3-compatible, generous free tier, no egress fees) or
S3. Keep the existing `objectStore` interface so callers don't change — swap the implementation
behind it, keeping the AES-256-GCM envelope encryption already in place. Add a migration path or
accept that existing PDFs are lost (they're regenerable — say which you chose).

### 2. Notifications are logged, never delivered

`createNotification()` in `src/core/notifications.ts` writes a DB row and then does
`console.log('[Notification Dispatch] ...')`. Nothing is ever sent. For a product whose core
value is **unattended** scheduled briefs, a failed 6am run is invisible until someone opens the
dashboard — which defeats the purpose.

Add real email delivery (Resend is the simplest fit for this stack; Postmark if transactional
deliverability matters more). Send on `brief_published` and `brief_failed` at minimum. Put the
send in the **worker**, not a Vercel route, and make it non-blocking — a failed email must never
fail the brief. Add a per-user notification preference so this is opt-out-able.

### 3. OAuth tokens are never refreshed

`src/connectors/tokenStore.ts` stores tokens with encryption, but there's no refresh path. Google
access tokens expire in ~1 hour. Once that happens, connector syncs start failing with auth
errors and the only fix is the user manually reconnecting — for *every* connector, silently.

Implement refresh-token exchange in `tokenStore`, called transparently when a token is expired or
an API returns 401. Surface a real "reconnect required" state on the connector card when the
refresh token itself is revoked or expired. This one will bite every single user within an hour
of connecting, so it's more urgent than it looks.

### 4. No rate limiting anywhere

There is no rate limiting on any route. `/api/auth/login` and `/api/auth/signup` are brute-forceable,
and the brief-creation routes trigger paid LLM calls — a loop against `/api/briefs/enqueue` runs up
a real bill. Quota enforcement (`usage.ts`) caps monthly briefs but doesn't stop a burst.

Add rate limiting: strict per-IP limits on auth routes, per-workspace limits on
brief/action-creating routes. Upstash Ratelimit works naturally since Redis is already
provisioned.

### 5. Retention policy has no scheduled trigger

`/api/retention` exists but nothing calls it on a cadence — the same gap schedules had before the
worker loop. Add a daily retention pass to the worker's interval loop (alongside the existing
cron scheduler), so the policy is actually enforced rather than being a button nobody presses.

### 6. Failed briefs have no recovery path

BullMQ retries 3× then moves the job to `removeOnFail` (7 days). After that the brief sits at
`status: 'failed'` forever with no user-facing retry — the user's only option is creating a brand
new brief and losing the thread/parent chain.

Add a "Retry" action on failed briefs that re-enqueues the existing brief ID, and surface the
actual failure reason from `briefs.error` in the UI instead of a generic failed state.

### 7. Worker cold starts delay briefs (free-tier consequence)

Render free tier spins the worker down after 15 minutes idle. `wakeWorker()` handles
user-triggered work, but **nothing wakes it for scheduled runs** — a 6am brief won't fire if the
worker is asleep, which quietly breaks the Operator tier's main promise.

Short term: an external uptime pinger (UptimeRobot, cron-job.org) hitting `/health` every 10
minutes keeps it warm for free. Document this in `DEPLOYMENT.md` as a required setup step, not an
optional one. Longer term this wants Render's paid always-on tier — note that, don't implement it.

### 8. Plan tier is self-service with no billing

`ProfileView` lets a workspace owner pick `free`/`pro`/`operator` from a dropdown that writes
straight to the DB. Quota enforcement is real, but anyone can grant themselves Operator. Fine
while pre-revenue — but before any public launch this needs a payment provider (Stripe or
Paddle) gating tier changes, and the dropdown should become read-only with an upgrade CTA.
Flag your recommendation; don't build the integration unless asked.

### 9. Structured error reporting

Errors currently go to `console.error` and vanish into Vercel/Render log streams. There's no way
to know a user hit a 500 unless they report it — which is exactly how the two bugs in Part 1 were
found. Add Sentry (or similar) to both the Next.js app and the worker, with release tagging so a
regression can be traced to a deploy.

---

## Deliverable

For Part 1: confirm both routes work in production and paste the grep output from Fix 1c showing
no remaining violations.

For Part 2: work items in order, one commit each. Before starting each, state your plan briefly.
If an item is already partly handled somewhere I missed, say so instead of building it twice.