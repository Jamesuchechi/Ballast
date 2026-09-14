# Ballast Infrastructure & Worker Deployment Guide

This document outlines the deployment architecture for Ballast and details the manual configuration steps required on **Render** to run the standalone background worker.

---

## Architecture Overview

Ballast is split into two complementary environments:

1. **Frontend & API (Vercel)**:
   * Hosts the Next.js web application and serverless route handlers.
   * Handles user authentication, dashboard UI, and enqueuing jobs to BullMQ (`/api/briefs/enqueue`, `/api/briefs/[id]/regenerate`, `/api/actions/[id]/approve`).
   * **Does not** execute long-running pipeline worker jobs directly.

2. **Background Worker (Render)**:
   * Hosts the persistent BullMQ worker (`src/worker.ts` via `npm run worker`).
   * Consumes jobs from Redis (`ballast-briefs` and `ballast-actions`).
   * Executes multi-stage document retrieval, multi-provider LLM calls (writer/critic), verification, citation generation, action drafts, and external action executions.
   * Runs an autonomous 60-second cron scheduler loop (`cron-parser`) querying and triggering enabled schedules, guarded with row-level atomic locks against double-firing.
   * Emits a 60-second heartbeat log for liveness observability.

Both services connect to the **same PostgreSQL database** (`DATABASE_URL`) and the **same Redis queue** (`REDIS_URL`).

---

## Manual Steps Required on Render (Action for James)

> [!IMPORTANT]
> Because Render requires account credentials and manual service creation, these steps cannot be performed programmatically by the assistant. You will need to set up the Background Worker service on Render directly.

### Option A: Deploy via Render Blueprint (Recommended)

1. Log into your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** in the top navigation bar and select **Blueprint**.
3. Connect your GitHub repository (`Jamesuchechi/Ballast`) and select the active branch.
4. Render will detect [`render.yaml`](file:///home/jamesuchechi/Projects/Ballast/render.yaml) and automatically configure:
   * **Service Name**: `ballast-worker`
   * **Service Type**: `Background Worker`
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm run worker`
5. Click **Apply**.
6. Under the service's **Environment** tab, populate the required secret environment variables (see table below).
7. Trigger a manual deploy (or allow Render to deploy automatically).

---

### Option B: Manual Service Creation

1. Go to the [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** -> **Background Worker**.
3. Connect the `Ballast` repository.
4. Fill in the service configuration:
   * **Name**: `ballast-worker`
   * **Region**: Choose the region closest to your database (e.g., `Oregon (US West)`).
   * **Branch**: `main` (or your working branch).
   * **Root Directory**: Leave blank (root).
   * **Runtime**: `Node`
   * **Build Command**: `npm install && npm run db:migrate`
   * **Start Command**: `npm run worker`
   * **Plan**: `Starter` (Background workers require an always-on instance).
5. Add the Environment Variables listed below.
6. Click **Create Background Worker**.

---

## Versioned Database Migrations

Ballast uses a numbered, version-tracked migration engine located in [`src/db/migrations/`](file:///home/jamesuchechi/Projects/Ballast/src/db/migrations):

* `001_init.sql`: Baseline schema creating all 14 tables, vector extension, and indexes.
* `002_add_source_inspection_and_metadata.sql`: Adds inspection columns (`sync_window_start`, `synced_at`, `fetched_at`, `last_error`, `raw_uri`, `meta`).
* `003_add_schedule_last_triggered_at.sql`: Adds `last_triggered_at` and supporting index for the cron engine.

### Concurrency Protection & Automation
1. **Advisory Locking**: When [`migrate()`](file:///home/jamesuchechi/Projects/Ballast/src/db/migrate.ts) executes, it acquires a PostgreSQL advisory lock (`pg_advisory_lock(7483920194)`). If Vercel and Render deploy concurrently, one process waits and proceeds safely without racing or colliding.
2. **Tracking Table**: Recorded migrations are tracked in `_migrations (id, filename, applied_at)`. Already-applied files are skipped.
3. **Automated on Every Deploy**:
   * **Render**: Configured in [`render.yaml`](file:///home/jamesuchechi/Projects/Ballast/render.yaml) as part of `buildCommand: npm install && npm run db:migrate`.
   * **CI / GitHub Actions**: Configured in [`.github/workflows/ci.yml`](file:///home/jamesuchechi/Projects/Ballast/.github/workflows/ci.yml).
   * **Manual / Pre-deploy**: Run `npm run db:migrate` locally or in any deployment shell against production `DATABASE_URL`.

---

## Environment Variables Contract

Set the following environment variables in the Render Background Worker service to match your Vercel deployment:

| Variable | Description | Example / Source |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode | `production` |
| `DATABASE_URL` | PostgreSQL connection string | Same database URI used on Vercel (Neon, Render Postgres, etc.) |
| `REDIS_URL` | Redis URI for BullMQ queues | Same Redis connection used on Vercel (Upstash or Redis URI) |
| `UPSTASH_REDIS_URL` | *(Optional)* Upstash TLS URI | Alternative to `REDIS_URL` if using Upstash directly |
| `GEMINI_API_KEY` | Google Gemini API key | Same key as on Vercel |
| `GROQ_API_KEY` | Groq Cloud API key | Same key as on Vercel |
| `MISTRAL_API_KEY` | Mistral AI API key | Same key as on Vercel |
| `OPENROUTER_API_KEY`| OpenRouter API key | Same key as on Vercel |

*(Note: Managed PostgreSQL and Redis can optionally be provisioned directly inside Render if you prefer to consolidate your database and queue on Render).*

---

## Verifying Worker Operation

Once the Render Background Worker service is deployed, check Render's live log stream:

1. **Startup Banner**: You should see:
   ```text
   [Worker] Ballast async worker starting on queues "ballast-briefs" & "ballast-actions"...
   [Worker Env] Connecting with configurations:
     - DATABASE_URL: Configured
     - REDIS_URL: Configured
     - LLM Providers: Gemini=true, Groq=true, Mistral=true, OpenRouter=true
   ```
2. **Heartbeat**: Every 60 seconds, you should see:
   ```text
   [Worker Heartbeat] Ballast background worker alive (uptime: 60s, briefs processed: 0, actions processed: 0)
   ```
3. **Job Execution**: When generating or regenerating a brief in the web app, the worker logs:
   ```text
   [BriefWorker] Starting job brief-<id> for brief <id>
   ...
   [BriefWorker] Completed job brief-<id> for brief <id> (status: published, total briefs: 1)
   ```
