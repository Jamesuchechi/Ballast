# Task: Remove all seeded/demo data from Ballast; make every UI surface show only real data

## Context

The Phase A-F de-mocking pass (LLM router, real connectors, real embeddings, real queue, real
action execution) landed correctly — verified in code, not just the diff. This pass is different:
it's about data, not infrastructure. Two concrete problems remain, confirmed in the current code:

1. **Every workspace gets fabricated data injected as if it were real.** `src/core/briefSeed.ts`
   (`seedCanonicalBrief` / `seedCanonicalWorldBrief`) inserts a hardcoded "Q3 Billing Revamp
   Status" brief with fake evidence and citations directly into `briefs`/`sources`. It's called:
   - On every signup (`src/app/api/auth/signup/route.ts`)
   - From `POST /api/briefs` (`src/app/api/briefs/route.ts`)
   - From `handleSeedBrief` in `src/app/app/page.tsx`, which is wired to:
     - The Topbar's primary create button (`onCreateBrief={handleSeedBrief}`, line ~761)
     - The floating `+` button on `MobileBottomBar`
     - Both empty-state "Seed Home Brief" / "Seed World Brief" buttons (~line 1092, 1101)

   Meanwhile `handleEnqueueBrief` (POSTs to `/api/briefs/enqueue`, the real BullMQ → LLM
   writer/critic pipeline) is only reachable from the question-input box. The most prominent
   buttons in the app currently bypass the real product entirely.

2. **The right sidebar (`ConnectorCard`'s sibling, `src/components/dashboard/RightSidebar.tsx`,
   the "Context Inspector") hardcodes fake telemetry as fallback values** whenever `runs` data is
   incomplete: `runs.cost || 0.0042`, `runs.latency_ms || 940`, `runs.tokens_in || 1840`,
   `runs.tokens_out || 412`, and a Circuit Breaker badge that always reads "Armed & Healthy"
   regardless of actual state. Compare this to the "Runs & Telemetry" page in `page.tsx`
   (`activeSection === 'audit'`), which does this correctly — real `|| 0` defaults and an honest
   empty state.

## Non-negotiable rule for this pass

No screen may display a number, badge, or status that isn't derived from a real query result.
If there's no data yet, show an explicit empty state ("No runs yet", "Not connected") — never a
plausible-looking placeholder number. This is the same rule as the last pass, applied to
frontend fallback values this time, which are just as misleading as a backend mock.

## Tasks

### 1. Delete the seed system as a runtime feature
- Remove the `seedCanonicalBrief` / `seedCanonicalWorldBrief` call from
  `src/app/api/auth/signup/route.ts`. New workspaces start empty — an honest empty state
  ("No briefs yet — connect a source and ask your first question") is correct and expected.
- Remove the `POST /api/briefs` seed-insert behavior from `src/app/api/briefs/route.ts`, or
  repurpose that route for something real if it's needed elsewhere — don't leave a live endpoint
  that fabricates data.
- You may keep `briefSeed.ts` and its contents **only** as an explicit dev/eval fixture, invoked
  from a script or test harness gated behind `NODE_ENV=test` / `EVAL_USE_MOCK=true`, matching the
  pattern already used for connector mocks. It must not be reachable from any user-facing route
  or button in a real session.

### 2. Repoint every "create brief" surface at the real pipeline
- Delete `handleSeedBrief` entirely.
- Wire the Topbar's `onCreateBrief`, the `MobileBottomBar` floating `+` button, and both
  empty-state buttons to open the real question-input flow (or directly call
  `handleEnqueueBrief` if you want a zero-click "quick brief" — but it must go through
  `/api/briefs/enqueue`, never `/api/briefs`).
- If a one-click "quick brief" experience is still wanted for onboarding, build it as a
  suggested-question prompt that still runs through the real pipeline — never a canned insert.

### 3. Fix the right sidebar's fake telemetry
In `RightSidebar.tsx`, replace every `|| <fake number>` fallback with a real `|| 0` (or a proper
empty state matching the pattern in the `audit` section of `page.tsx`). The Circuit Breaker badge
must reflect the real `circuit_broken` value passed in via `runs`, not a hardcoded "healthy"
string — mirror the logic already correctly written in the `audit` section
(`telemetry?.telemetry?.circuit_broken_count > 0 ? 'Tripped' : 'Armed (Healthy)'`).

### 4. Fix the sidebar's fake storage badge
In `Sidebar.tsx`, the "Upload & Ingest" nav item hardcodes `count: '20 MB'`. Either compute a real
figure (sum of ingested source sizes for the workspace, or actual storage used) and pass it in as
a prop the way `sourcesCount`/`schedulesCount` etc. already are, or remove the count badge from
that nav item entirely until a real quota system exists. Don't leave a static number.

### 5. Clean up the dead default prop
`MobileBottomBar`'s `pendingActionsCount = 1` default is currently harmless (the real call site
always passes the actual count), but fix the default to `0` anyway — a wrong default is a bug
waiting for the next refactor that forgets to pass the prop.

### 6. Full sweep — confirm nothing else was missed
Grep the whole `src/` tree (excluding `test/` and the now-gated eval fixture path) for any
remaining `SAMPLE_`, `MOCK_`, `seed`, `demo`, or hardcoded plausible-looking numbers used as UI
fallbacks, and fix or explicitly justify each one. Paste the grep output and your disposition of
each hit.

### 7. Redesign the landing page to actually look like the same product

**Diagnosis first.** The dashboard has a real, distinctive visual identity: `globals.css`
defines a dark console palette (`--card-bg: #0d0f15`, `--card-bg-subtle: #131620`), JetBrains
Mono for all chrome and labels, and a specific emerald/cyan accent system (`#10b981`, `#06b6d4`)
used consistently for "grounded", "verified", "healthy" states. It reads like an audit console —
appropriate for a product whose entire pitch is "if it cannot cite, it does not state."

The landing page (`src/components/landing/*`) throws all of that away and uses a generic
cinematic-SaaS template instead: a stock background photo (`/hero-bg.jpg`) with a Ken Burns zoom,
an Apple-style white pill CTA, a green status dot, and hardcoded hex colors (`#16a34a`, `#dc2626`,
`#d97706`) that don't match the dashboard's palette at all. `Navbar.tsx` hardcodes white text
(`color: "#ffffff"`) with zero `var(--...)` token usage — it doesn't participate in the theme
system the rest of the app has (a working light/dark toggle). This is why it feels like a
different product bolted onto the front of the real one.

**Direction: don't invent a third aesthetic — the dashboard's console identity IS the brand.**
Extend it forward onto marketing instead of replacing it with a template.

- **Kill the stock photo hero.** Replace `/hero-bg.jpg` + Ken Burns zoom with a live, animated
  component that demonstrates the actual product mechanic as the hero visual: text streaming in,
  a claim getting flagged, a citation snapping into place, a "grounded" badge appearing — the
  same visual language already built in `RightSidebar.tsx` and `MockupView.tsx`, just given
  motion and made the star of the page instead of a generic photo. The product's core
  differentiator (citation-gating) should be *shown happening*, not just claimed in a headline.
- **One palette, one set of tokens, everywhere.** Every landing component should consume
  `var(--card-bg)`, `var(--text)`, `var(--text-muted)`, `var(--font-mono)`, and the same
  emerald/cyan accent pair from `globals.css` — no new hardcoded hex values, no separate color
  system. `Navbar.tsx` and `Footer.tsx` need the same light/dark theme support the dashboard has.
- **Typography with a point of view.** Keep JetBrains Mono for labels/chrome/badges (already
  correct in the stat bar), but pair it with a serious, editorial display face for the headline —
  something with authority (a strong grotesk or slab), not the generic ultra-thin
  `font-weight: 300` look shared by every AI-SaaS hero on the internet right now.
- **Motion should teach, not decorate.** Any animation on the page should be tied to explaining
  the product (a claim being verified, a diff appearing, a source getting cited) — cut decorative
  effects that don't carry meaning (the film-grain overlay and radial vignette on the hero are
  pure template decoration; drop them in favor of motion that shows the mechanic).
- **Audit the rest of the funnel for the same disconnect**: `ComparisonTable.tsx`, `HowItWorks.tsx`,
  and `Footer.tsx` all use hardcoded hex colors instead of tokens — bring all three in line with
  the same system before calling this done.
- Keep the existing copy — "Ask The Messy. Ship The Brief." and the "if it cannot cite, it does
  not state" line are good and on-brand. This is a visual system fix, not a rewrite of the
  messaging.

Treat this as a redesign, not a patch: propose the new Hero/Navbar/Footer structure first (a short
plan of what changes and why, tied to the tokens above), then implement.

## Verification

After this pass, a brand-new signup should show a completely empty dashboard with honest empty
states everywhere, and the only way a brief, citation, or telemetry number appears anywhere in the
UI is because it came from a real connector sync or a real question run through
`/api/briefs/enqueue`. Confirm this by creating a fresh test account and walking through: sidebar,
right sidebar, topbar, bottom bar, and every section (briefs, upload, actions, sources, schedules,
diff, audit, access-logs, flags, settings) with zero data connected yet — screenshot or describe
what each shows.