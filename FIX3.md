# Task: Stand up real background processing infrastructure for Ballast

## Context

Confirmed root cause of the production 500s: `src/worker.ts` (the BullMQ consumer for briefs
and actions) has never been deployed anywhere. Vercel only runs the Next.js app's serverless
functions — it cannot host a persistent worker process. Every job enqueued via `enqueueBriefJob`
in production has been going into a Redis queue that nothing consumes. The `setImmediate` inline
fallback in `regenerate/route.ts` is a workaround for this gap, and it's unreliable on Vercel
(the function can freeze right after the HTTP response is sent, before the inline work finishes).
The same missing-worker gap silently breaks scheduled briefs — `runSchedule()` in
`src/core/scheduler.ts` is correct code with nothing to invoke it on a cadence.

This is an infra task as much as a code task. You can prepare all the code and config; actually
creating the hosting account/service and setting its environment variables is something James
does manually afterward — call that out explicitly rather than assuming it's done.

## 1. Fix the double-dispatch bug first (quick, independent of the rest)

In `src/app/api/briefs/[id]/regenerate/route.ts`, remove the `setImmediate(...)` inline-execution
block entirely. Keep only the `enqueueBriefJob(...)` call. A brief should be processed exactly
once, by the real worker — never speculatively inline as well. Apply the same audit to
`src/app/api/briefs/enqueue/route.ts` and anywhere else `processQueuedBrief` or `executeAction`
might be called directly outside of `worker.ts` — there should be exactly one code path that
actually executes a job, and it's the worker.

## 2. Package the worker for standalone deployment

Target platform: **Render**, as a Background Worker service (not a Web Service — it doesn't need
to accept HTTP traffic, though see the health-check note below).

Prepare `src/worker.ts` to run as its own long-lived service, separate from the Vercel app:
- Add a `render.yaml` (Render's Blueprint spec) defining a service of `type: worker` with
  `buildCommand: npm install` and `startCommand: npm run worker` (confirm whether `tsx` needs a
  separate build step or can run the TypeScript worker directly in production — if not, add a
  `worker:build` script and point `startCommand` at the compiled output instead of running `tsx`
  in production). Prefer Render's native Node runtime over a Dockerfile unless something about
  the worker's dependencies needs it — fewer moving parts to maintain.
- Make sure the worker reads `DATABASE_URL`, `REDIS_URL`, and all four LLM provider keys from
  env, matching what the Vercel app already expects — same `.env` contract, different host.
  Note anywhere the worker currently assumes a local/dev Redis or Postgres connection string and
  fix it to use the env var instead.
- Render's Background Worker type restarts the process automatically on crash/nonzero exit, so a
  separate health-check endpoint isn't required — but add a periodic log heartbeat (e.g. once a
  minute, "worker alive, N jobs processed") so liveness is visible in Render's log stream without
  needing to guess whether the process is stuck.
- Document in a short `DEPLOYMENT.md`: what James needs to do manually on Render (create the
  Background Worker service from this repo/branch, point `DATABASE_URL` and `REDIS_URL` at the
  same Postgres/Redis the Vercel app already uses — Render can also host managed Postgres/Redis
  if he'd rather consolidate there, note that as an option — set the four LLM provider keys, and
  deploy). Be explicit that you cannot create the Render service or set its env vars yourself —
  flag that step clearly rather than marking it done.

## 3. Give scheduling a real trigger, inside the worker

Since the worker will now be a real persistent process, put the cron trigger there rather than
relying on Vercel Cron (which would require a separate always-on plan and another moving part).
Add a lightweight scheduler loop to `worker.ts` (a `setInterval` checking every 60s, or
`node-cron`) that:
- Queries `schedules` for rows that are `enabled` and due (compare `cron` against current time —
  use a small cron-parsing library like `cron-parser` rather than hand-rolling cron math).
- Calls `runSchedule(scheduleId)` for each due row.
- Guards against double-firing if the worker restarts mid-minute (check `last_run_brief_id`'s
  timestamp or add a `last_triggered_at` column with an advisory lock before firing).

## 4. Replace the schema.sql-only "migration" with real versioned migrations

Current state: `db:migrate` runs one `CREATE TABLE IF NOT EXISTS`-only `schema.sql`, which never
alters a table that already exists — so any new column added to `schema.sql` silently never
reaches production, which is almost certainly why `/api/sources` 500'd.

- Create `src/db/migrations/` with numbered files (`001_init.sql`, `002_add_source_inspection.sql`,
  etc.) — reconstruct the sequence from the actual schema history if needed, or start fresh with
  `001` as a snapshot of the current `schema.sql` and add real incremental `ALTER TABLE`
  migrations from here forward.
- Add a `_migrations` tracking table (id, filename, applied_at) and rewrite `migrate()` to apply
  only files not yet recorded, in order, inside a transaction, taking a Postgres advisory lock so
  two processes (e.g. a redeploy of both the Vercel app and the worker at once) can't race.
- Wire this to actually run on every deploy, not just when someone remembers: add it as a
  predeploy step (a GitHub Action that runs `npm run db:migrate` against the production
  `DATABASE_URL` before/as part of merging to `main`, or a Vercel "ignored build step" hook) —
  pick whichever fits the existing CI setup, and document the choice in `DEPLOYMENT.md`.
- Run this once against production first (by hand, carefully) to bring the live DB in sync with
  everything `schema.sql` currently defines, confirming both `/api/sources` and `regenerate`
  start working before moving on.

## Verification

After this lands (and James has deployed the Render Background Worker service): trigger a
regenerate on a real brief in production and confirm exactly one job runs (check Render's log
stream for a single `[BriefWorker] Starting job...` line, not two); confirm `/api/sources` loads
without a 500; confirm a test schedule set a minute in the future actually fires and shows up in
the Render logs without anyone touching the dashboard. State clearly which of the above you
completed in code vs. which steps still need James to create the Render service and set its env
vars — that part can't be done from inside the repo.