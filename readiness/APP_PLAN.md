# Readiness App Plan

## Goal

Build a zero-cost `web app + PWA` around the existing readiness engine so we can test the daily workflow for 2-4 weeks before spending time on native mobile, widgets, or paid infrastructure.

The app should answer:

- How ready am I today?
- What is driving that score?
- What is planned today?
- Should I train as planned, adjust, or recover?

## Topology (POC)

Resolved architecture for the proof of concept:

- Compute stays on the laptop: sync, scoring, and AI insight generation all run from the local Python engine
- Database lives in a free hosted Postgres (Neon by default)
- The web app runs on Vercel free tier, reads and writes Postgres directly
- Every DB access goes through a repo abstraction so we can swap providers (Neon, Supabase, Turso, local SQLite, self-hosted Postgres) without touching features

This collapses the old phone-access, concurrency, and Stage-2-migration problems into a single setup.

## Open Decisions

These must be resolved before Week 1 starts. Each one changes repo layout, data flow, or acceptance criteria.

### 1. Phone access

Resolved by the topology: the web app is deployed to Vercel free, so the phone hits a public URL the same way any other user would. No Tailscale or tunnel required.

This introduces a new sub-decision: auth.

- Short term: Vercel Deployment Protection or a shared-secret cookie
- Medium term: a single-user magic-link flow (Auth.js with email provider or a GitHub OAuth gate)
- Longer term: real multi-user auth if and only if Stage 2 happens

### 2. DB access from Next.js

Resolved: Postgres over `postgres` / `@neondatabase/serverless` with `Drizzle` as the query + migration layer.

- `Drizzle` schema in TS is the source of truth
- `drizzle-kit` generates migrations
- Python reads the same Postgres via `SQLAlchemy` against the same tables
- No Python sidecar, no JSON snapshots

### 3. Timezone and day boundary

- Canonical timezone stored in `settings`
- "Today" rolls over in that timezone, matching the rule already used for `strava_activities.local_day`
- Late-night check-ins follow the cutoff defined in the Check-In milestone
- Travel / DST: the configured timezone wins until the user changes it

### 4. Schema sharing between Python and TypeScript

Resolved: one schema, generated types on both sides.

- `Drizzle` schema in `readiness-web/lib/db/schema.ts` is the source of truth
- `drizzle-kit generate` produces SQL migrations committed to the repo
- Python uses `SQLAlchemy` with a thin module that mirrors the Drizzle schema; a pre-commit check diffs the two to prevent drift
- `schema.sql` in the `readiness/` folder is retired once Postgres is live (kept as historical reference)

### 5. Concurrency model

Resolved by Postgres: standard ACID, no WAL tricks, no read-only-connection dance. Python writes, Next.js reads and writes, both are safe.

### 6. Offline / privacy fallback

Retained: SQLite path stays in the repo behind the same repo abstraction for:

- Fully offline development
- Privacy-preserving mode if the user ever wants data never to leave the laptop

Not used in the POC default topology.

### 7. How the hosted web app triggers local compute

The web app ("Sync now", "Regenerate insight") needs to run Python that lives on the laptop. Two viable paths:

- Command queue in Postgres: the web app inserts a row into a `job_queue` table; the laptop polls it every N seconds and executes. Simplest, no inbound connectivity required.
- Direct call via Tailscale / tunnel back to a local HTTP endpoint. Faster but adds an always-on networking dependency.

Recommended: command-queue table, because it makes the laptop dependency soft and survives intermittent connectivity. Stage 2 replaces the poller with a hosted worker reading the same queue.

### 8. AI analysis provider

The readiness engine stays deterministic. AI is an explanation and commentary layer on top of it. Provider choice determines cost, privacy, and setup.

Resolved for Stage 0: use the existing Codex subscription via the `codex` CLI (`codex exec`). No extra API key to manage, no per-token billing to track, and it runs locally from the morning job.

Alternatives retained for later:

- Direct API calls (OpenAI or Anthropic) from Python if we move off the personal subscription
- `ollama` with a small local model as a privacy-preserving, fully offline fallback

Whichever provider runs, the integration is abstracted behind a single `run_insight(prompt, context) -> dict` function so the backend can be swapped from Settings without changing the rest of the app.

## Product Scope

### In Scope

- `Today` dashboard
- `History` and trend views
- Planned workout context from Intervals
- Subjective check-in
- Sync health / integrations screen
- AI-generated daily insight narrative on top of the deterministic score
- PWA install support
- Phone-friendly daily use from browser

### Out of Scope for Now

- Native iOS app
- Native Android app
- Home screen widgets
- WhatsApp integration
- Billing
- Coach or team workflows
- Multi-user productization
- Paid infra or notification services

## Product Surfaces

### Primary Surface

- `Web app`
- `PWA` install on phone home screen

### Internal Surface

- Existing `CLI` remains available as an operator tool for sync, scoring, and debugging

### Deferred Surfaces

- Native mobile app
- Widget

## Architecture

### Frontend

Stack:

- `Next.js` (App Router)
- `TypeScript` strict mode
- `Tailwind CSS` for styling
- `shadcn/ui` for primitives
- `Recharts` for trend charts
- `lucide-react` for icons
- `React Query` only if client-side refresh is needed; prefer Server Components for data reads
- Package manager: `pnpm`
- Node: LTS

Responsive, mobile-first. PWA support as described in the PWA section below.

Initial routes:

- `/today`
- `/history`
- `/check-in`
- `/integrations`
- `/settings`

### Backend

Keep the existing Python readiness engine as the source of truth for:

- Coros sync
- Strava sync
- Intervals sync
- readiness scoring
- AI insight generation (batched, cached)

For the first version:

- `Next.js` handles UI and writes user-facing data (check-ins, settings)
- Python scripts run locally for sync, scoring, and AI insight runs
- Shared hosted Postgres is the contract between them
- Both sides speak to the DB through repo classes so the provider is pluggable

### AI Layer

- Lives in Python next to scoring, not in the web app
- Invoked from the morning job and from the check-in rescore path
- Calls an LLM through a pluggable backend: `codex` CLI, direct API, or local `ollama`
- Output is strict JSON, cached in `ai_insights` keyed by `(date, prompt_version, model)`
- Deterministic scoring is unchanged; AI never overrides the score or status
- The app reads insights from SQLite like any other contract object

### Database

POC default:

- Hosted Postgres (Neon free tier)
- `Drizzle` as the TS query + migration layer
- `SQLAlchemy` on the Python side, same tables
- Single connection string configured via `DATABASE_URL`
- One branch per schema change during development (Neon branching), merged on deploy

Retained alternatives behind the same repo interface:

- Local `SQLite` for offline dev and privacy-preserving mode
- Self-hosted or alternative provider (Supabase, Turso, Railway Postgres) with no code change

### Repo abstraction

Every feature speaks to a small set of repositories, not to raw SQL:

- `DailyMetricsRepo`
- `SleepRepo`
- `ActivitiesRepo`
- `PlannedSessionsRepo`
- `CheckinsRepo`
- `ReadinessRepo`
- `SyncRunsRepo`
- `AiInsightsRepo`
- `SettingsRepo`
- `JobQueueRepo` (web-to-laptop command queue)

Each has a Postgres implementation and a SQLite implementation. The concrete class is chosen at startup based on `DATABASE_URL`.

### Schema and Types

- `readiness-web/lib/db/schema.ts` (Drizzle) is the source of truth
- `drizzle-kit` generates migrations in `readiness-web/lib/db/migrations/`
- TS types for rows come from Drizzle automatically
- Python mirrors the schema in `readiness/health_readiness/schema_py.py`
- A `pnpm check:schema` script introspects Postgres and compares against both definitions to catch drift

### Timezone

- Single canonical timezone stored in `settings`
- "Today" is defined by that timezone, matching the rule already used for `strava_activities.local_day`
- Check-ins submitted after midnight local time are attributed by an explicit rule documented in the Check-In milestone

### Scheduling

Free-first scheduler:

- macOS `launchd` with `StartCalendarInterval` and `WakeFromSleep` so the morning sync runs even if the laptop was asleep
- `cron` is insufficient on macOS because it does not wake the machine

Morning job flow:

- sync sources
- compute readiness
- generate AI insight for today and cache it in `ai_insights`
- write a structured run record to `sync_runs`
- app reads freshness from `sync_runs` and `updated_at` columns

An AI-only rerun path is also available for when a check-in updates the score and the narrative needs to follow.

## Feature Plan

## Milestone 1: App Shell

### Goal

Replace the static report with a real app shell.

### Deliverables

- Next.js app scaffold with `pnpm`, TS strict, ESLint, Prettier
- Global layout and dark visual system (see Design System)
- Navigation (bottom tab bar on phone, sidebar on desktop)
- Reusable dashboard cards, skeleton loaders, empty and error states
- Mobile-first responsive layout
- PWA manifest, icons, service worker (see PWA section)
- Global "stale data" banner driven by `sync_runs`

### Acceptance

- App opens cleanly on desktop and phone
- App can be installed to the home screen on iOS and Android
- All core states render without live data (loading, empty, stale, error)
- Lighthouse PWA checks pass

### Design System

- Dark theme first, light theme deferred
- Color tokens for `background`, `surface`, `text`, `muted`, `accent`, `positive`, `caution`, `negative`
- Typography scale: display, heading, body, mono for numeric readouts
- Spacing scale aligned with Tailwind defaults
- Minimum touch target 44px
- AA contrast
- Honor `prefers-reduced-motion`
- Standard state styles: loading skeleton, empty, stale, error, offline

### PWA

- `manifest.webmanifest` with name, short_name, theme_color, background_color, display `standalone`
- Icons at 192, 512, maskable 512
- iOS: apple-touch-icon, status bar style, standalone viewport
- Service worker with stale-while-revalidate for `/today` and `/history` data responses
- Explicit offline fallback page showing last cached day and a "data is stale" indicator
- Update prompt when a new SW is available

## Milestone 2: Today Screen

### Goal

Make the app useful every morning.

### Deliverables

- Today header with date, score, status, confidence
- Sleep / Recovery / Strain rings
- Health Monitor card
- Planned Today card
- Daily Outlook card
- 5-day trend strip
- Source freshness indicators

### Data Sources

- `readiness_scores`
- `daily_metrics`
- `sleep_records`
- `planned_sessions`
- `strava_activities`
- `sync_runs` for freshness
- `subjective_checkins` for a "checked in today" badge

### States to design explicitly

- No data yet (fresh install, before first sync)
- Partial data (e.g. Coros synced, Strava failed)
- Stale data (last sync too old)
- Data is current but check-in missing
- Offline (show last cached day with banner)
- AI insight present
- AI insight missing or failed (degrades silently to rule-based drivers)
- AI insight out of date relative to latest score (stale narrative banner)

### Affordances on the page

- Manual "resync now" action that triggers the morning job
- Link from score card to a day-detail view
- Display `model_version` so calibration changes are visible

### Performance budget

- LCP under 1.5s on a mid-range phone over 4G
- JS under 150KB gzipped for `/today`

### Acceptance

- Today screen reflects the same data as `readiness/cli.py today`
- No manual HTML generation step required
- Loads within the performance budget on phone
- Every state above is reachable and visually distinct

## Milestone 3: History

### Goal

Validate longer-term usefulness.

### Deliverables

- 7 / 30 / 90 day readiness trend
- HRV trend
- Sleep trend
- Resting HR trend
- Training load / load ratio trend
- Simple range toggles
- Day-detail drilldown from any point on a chart
- CSV export of the visible range

### Missing-day handling

- Gaps rendered as explicit breaks, not interpolated
- Tooltip distinguishes "no data" from "score = 0"

### Acceptance

- User can understand whether today is normal or unusual
- Missing days are visible and not misleading
- Drilldown reaches the same day-detail view as the Today card link

## Milestone 4: Check-In

### Goal

Improve signal quality.

### Deliverables

- Quick form for:
  - energy
  - mood
  - soreness
  - stress
  - illness
  - notes
- Save to `subjective_checkins`
- Trigger a rescore for the affected day via the same code path used by `cli.py checkin`
- Edit today's check-in at any time
- Edit yesterday's check-in up to a documented cutoff (e.g. noon next day)
- Late-night submits (after local midnight, before configured cutoff) are attributed to the previous day with a visible note

### Acceptance

- Check-in works on phone in under 20 seconds
- Score for the affected day updates without a manual rescore step
- Score explanations can reference subjective input when present
- `illness` flag affects the Today recommendation visibly

## Milestone 5: Integrations / Sync Health

### Goal

Build trust in the data.

### Deliverables

- Integrations page backed by `sync_runs`
- Status for:
  - Coros
  - Strava
  - Intervals
- Last sync time
- Last successful sync
- Latest imported date per source
- Basic error summary if last sync failed with a link or expandable block showing the captured error
- Action buttons: "Sync now", "Re-auth Strava", "Re-auth Intervals"
- Link to the most recent `launchd`/cron log

### Acceptance

- User can tell when data is stale
- Sync failures are visible instead of hidden
- Triggering a manual sync from the UI updates `sync_runs` the same way the morning job does

## Milestone 6: Plan vs Readiness

### Goal

Make the app actionable, not just descriptive.

### Deliverables

- Simple session intensity heuristic from `planned_sessions.type`, `name`, and `description`
- Heuristic rules documented up front, not discovered mid-build. Starting set:
  - `type == Ride|Run|Swim` with interval markers (`x`, `@`, `z4`, `z5`, `threshold`, `vo2`) => `hard`
  - Long duration over a user-set threshold => `long`
  - Recovery / Z1/Z2 markers => `easy`
  - Everything else => `moderate`
- Compare classified intensity against today readiness status
- Classify outcome:
  - `Train as planned`
  - `Proceed with caution`
  - `Keep it easy`
- Show concise reasoning that cites specific drivers

### Acceptance

- Today view can tell you whether the planned session fits your current state
- Logic stays simple and explainable
- Heuristic lives in one pure function with unit tests

## Milestone 7: Notifications

### Goal

Test the daily habit loop at zero cost.

### Deliverables

- Browser notification permission flow
- Optional reminder to open the app
- Optional summary notification after morning sync
- Optional Telegram digest later if needed

### iOS caveats

- Web push on iOS requires iOS 16.4+ and the PWA installed to the home screen
- Requires a VAPID keypair and a push subscription endpoint
- While the app is local-only, scheduled push from a sleeping laptop is unreliable; Telegram digest may be the more honest option in Stage 0

### Acceptance

- Notifications work without paid providers
- They can be turned on or off easily
- iOS limitations are documented in the settings UI so expectations are correct

## Milestone 8: AI Insights Layer

### Goal

Add a narrative layer on top of the deterministic score so the Today screen can explain the day in plain language without replacing the numeric model.

### Principles

- Deterministic scoring is the source of truth
- AI explains, contextualizes, and comments on planned session fit
- AI never overrides score, status, or recommendation
- Output is cached; the app never calls the LLM at request time
- AI failures degrade silently to the existing rule-based drivers

### Schema addition

```sql
CREATE TABLE ai_insights (
  date TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  summary TEXT,
  talking_points_json TEXT,
  session_advice TEXT,
  anomalies_json TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (date, prompt_version, model)
);
```

### Invocation

- New `readiness/cli.py insight` command
- Called from the morning job after scoring
- Called again after a check-in rescore
- Stage 0 backend: `codex exec` using the existing personal Codex subscription
- Pluggable: the same entry point can swap to direct OpenAI / Anthropic API or local `ollama` later
- Single `run_insight(prompt, context) -> dict` abstraction so the backend can be swapped from Settings

### Codex CLI integration (Stage 0)

- Backend implemented as `CodexInsightBackend` in `readiness/health_readiness/insight_codex.py`
- Invocation pattern:
  - Build a system-prompt file from `readiness/prompts/daily_insight_v1.md`
  - Serialize context (`today_summary`, 14-day trend, planned session, last check-in) as a single JSON blob
  - Call `codex exec` non-interactively, passing the prompt and the JSON blob on stdin
  - Capture stdout, parse as strict JSON, validate against the output schema
  - Persist to `ai_insights` with the CLI's reported model name and `prompt_version`
- Auth is handled by the Codex CLI session on the user's machine; the morning job must run as that user so the login is reused
- Timeout and retry: one retry with a lower temperature on JSON parse failure, then give up and record the failure in `sync_runs`

### Prompt strategy

- Prompt templates live in `readiness/prompts/` with a semantic version (e.g. `daily_insight_v1.md`)
- System prompt enforces: numeric score is authoritative, never contradict it, output must match the JSON schema
- Input context: `today_summary`, trailing 14-day trend, planned session, last check-in
- Output schema is strict JSON:
  - `summary` (short paragraph, max ~400 chars)
  - `talking_points` (array of 2-4 short bullets)
  - `session_advice` (one sentence tied to the planned session)
  - `anomalies` (array of flagged deviations, empty if none)
- Any prompt change bumps `prompt_version`

### Cost and rate limits

- Stage 0: covered by the personal Codex subscription; no per-token billing
- Still cap to at most two runs per day (morning + after check-in) to avoid wasted calls
- Manual "Regenerate insight" from Settings counts against a small daily ceiling to prevent runaway loops
- `tokens_in` and `tokens_out` are still recorded when the CLI exposes them, for visibility
- When switching to a paid API or `ollama` later, the same rate-limit surface applies

### Privacy

- Sending health metrics to a hosted LLM requires explicit opt-in in Settings
- Disabled by default until the user toggles it on
- The Codex subscription terms apply while that backend is active
- Local `ollama` option for privacy-preserving mode
- No raw tokens, emails, or external IDs included in the prompt payload

### UI

- New "Insights" card on `/today`, rendered below Daily Outlook
- Clearly labeled as AI-generated with the model name and prompt version in a tooltip
- If the latest score is newer than the cached insight, show a "narrative is older than score" banner
- If AI is disabled or failed, the card hides and the rule-based drivers remain the primary explanation

### Acceptance

- Morning job produces one cached insight per day
- Check-in rescore refreshes the insight without user action
- Today screen renders the Insights card from cache with no network call
- Disabling AI in Settings removes the card and stops all LLM calls
- Switching provider in Settings is a one-setting change with no code edits

## Milestone 9: Settings

### Goal

Give the user control over the few things that affect daily use.

### Deliverables

- Timezone (defaults to system)
- Units (metric / imperial)
- Long-session threshold used by plan-vs-readiness heuristic
- Check-in cutoff for previous-day attribution
- Notification toggles
- AI insights toggle (off by default; opt-in enables `codex` for Stage 0)
- AI provider selector: `codex` (default), `openai_api`, `anthropic_api`, `ollama`
- AI daily regeneration cap
- AI monthly token budget (informational while on the Codex subscription)
- Manual "Sync now" button (duplicate of integrations action for convenience)
- Manual "Regenerate insight" button
- Display `model_version`, active prompt version, DB path, app version
- Reset / wipe local data (with confirm)

### Acceptance

- All settings persist across reloads
- Changing timezone immediately updates what "today" means in the UI
- Toggling AI off removes the Insights card and stops scheduled LLM calls

## Lifecycle

## Stage 0: Personal POC

### Duration

1-2 weeks

### What We Do

- Provision Neon free Postgres
- Stand up Drizzle schema and migrations
- Local Python engine writes to Postgres (sync, scoring, AI insight)
- Web app deployed to Vercel free, reads and writes Postgres
- Single-user auth gate in front of the app
- Use the app personally every day

### Success Criteria

- You open it daily from your phone
- It helps decide how to train
- No major trust issues in the data
- Morning job is reliable on the laptop

## Stage 1: Stable Personal Tool

### Duration

Weeks 3-4

### What We Do

- Improve reliability
- Close data gaps
- Refine scoring display
- Harden integrations page and sync-run visibility
- Add plan-vs-readiness
- Tighten AI insight quality

### Success Criteria

- Stable daily use
- Low friction
- Better than the current CLI/report workflow

## Stage 2: Shared Free Beta

Only do this if Stage 1 works.

### What Changes

- Move the morning job off the laptop to a hosted worker (Render / Railway / Fly cron)
- Real multi-user auth
- Per-user data partitioning already respected by the schema

### Success Criteria

- App can be opened from anywhere without the laptop being on
- One or two additional users could try it

## Deployment Plan

### POC topology (default)

- Web app: `Vercel` free tier, auto-deploy from `main`
- Database: `Neon` free Postgres
- Compute: local laptop running Python via `launchd`
- Secrets: `DATABASE_URL`, Coros / Strava / Intervals tokens, Codex CLI login all live on the laptop
- Web app secrets: `DATABASE_URL` and auth secret in Vercel env

### Offline fallback

- Same code can run entirely on the laptop against a local SQLite file by setting `DATABASE_URL=sqlite:///...`
- Useful for travel, debugging, or a privacy-first user

### Future remote compute

- Move the morning job to `Render`, `Railway`, or `Fly` cron
- Web app and DB stay put; only the scheduler location changes

## Operational Plan

### Scheduling

- Morning job runs via `launchd` with `StartCalendarInterval` and `WakeFromSleep`
- `cron` only as a fallback when the laptop is known to be awake

### Logging

- All morning-job stdout/stderr captured to `readiness/data/logs/morning-YYYY-MM-DD.log`
- Log rotation: keep last 30 days
- Integrations page surfaces a link to today's log

### Backups

- Nightly copy of `readiness.sqlite` to an iCloud or Dropbox folder
- One manual backup before any schema change
- Restore procedure documented in the runbook

### Self-analytics

- Tiny local counter of app opens per day, stored in SQLite, rendered in Settings
- Used only to validate the "daily habit" Stage 0 success criterion

## Testing and Quality

### Scope

- Pure functions (plan-vs-readiness heuristic, timezone rollover, freshness calculation) have unit tests
- Data access layer has integration tests against a fixture SQLite DB
- At least one smoke E2E test that renders `/today` with seeded data

### Tooling

- `vitest` for unit tests
- `playwright` for smoke E2E
- `eslint` + `prettier` + `typescript --noEmit` in a single `pnpm check` script

## Widget Strategy

Do not build a native widget yet.

Instead:

- Make `/today` load very fast
- Keep the top strip compact and glanceable
- Install the PWA to the phone home screen

That gives most of the value without widget engineering.

## Repo Plan

Suggested structure:

```text
personal/
  readiness/
    cli.py
    data/
      readiness.sqlite
      logs/
    schema.sql
    health_readiness/
      db.py
      scoring.py
      report.py
      strava_client.py
      intervals_client.py
  readiness-web/
    app/
      today/
      history/
      check-in/
      integrations/
      settings/
    components/
    lib/
      db/            # read-only SQLite access, typed queries
      contracts/     # today_summary, history_summary, etc.
      readiness/     # plan-vs-readiness heuristic, pure functions
    public/
    styles/
    tests/
```

Generated TS types for DB rows live under `readiness-web/lib/db/types.generated.ts` and are regenerated from `schema.sql` with a single `pnpm` script.

## Data Contract Plan

The app should stop depending on generated HTML and instead depend on a small set of stable query functions or API responses.

Initial contract objects:

- `today_summary`
- `history_summary`
- `planned_sessions_for_day`
- `integration_status`
- `checkin_payload`
- `daily_insight` (cached AI narrative for a date)

### Example: `today_summary`

- date
- score
- status
- confidence
- recommendation
- sleep metrics
- HRV / baseline
- RHR / baseline delta
- load metrics
- Strava summary
- planned sessions
- drivers

## 4-Week Build Plan

## Week 0 (Pre-flight)

- Provision Neon project, capture `DATABASE_URL`
- Define Drizzle schema mirroring current tables plus `ai_insights` and `settings`
- Generate and run initial migration against Neon
- One-shot backfill script from current SQLite into Neon for historical data
- Stand up the repo abstraction on the Python side (`SQLAlchemy` + repos)
- Move the morning job to `launchd` with wake-from-sleep and point it at Neon
- Pick the Stage 0 auth approach (Vercel Deployment Protection is the default)

## Week 1

- Scaffold `readiness-web` with `pnpm`, TS strict, Tailwind, shadcn/ui
- Wire Drizzle client with Neon serverless driver
- Set up layout, design system tokens, and navigation
- Add PWA manifest, icons, service worker, offline fallback
- Put the single-user auth gate in front of every route
- Build `/today` with all explicit states, reading from Neon via typed repos

## Week 2

- Build `/history`
- Build `/integrations`
- Clean up the data access layer
- Replace static report as the primary UI

## Week 3

- Build `/check-in`
- Add plan-vs-readiness logic
- Wire AI Insights Layer end to end: `ai_insights` table, `cli.py insight`, morning-job hook, Insights card on `/today`
- Improve explanations and data freshness states

## Week 4

- Add browser notifications
- Settings screen incl. AI toggle and provider selector
- Tighten mobile UX
- Run daily with no CLI dependency except the scheduled morning job
- Document the operational flow

## Definition of Done for the Test Run

The free-first app is ready when:

- You can open it on your phone home screen
- It shows current readiness without generating HTML manually
- Planned session appears reliably
- Sync status is visible
- You can submit a daily check-in
- You use it for 2-4 weeks as the default morning workflow

## Immediate Next Steps

1. Provision a Neon project and commit the Drizzle schema in `readiness-web/lib/db/schema.ts` mirroring the current SQLite tables plus `ai_insights` and `settings`. Run the first migration.
2. Write a one-shot backfill script that copies the current SQLite contents into Neon so history is preserved.
3. Introduce the repo abstraction on the Python side (`SQLAlchemy` + repo classes), keep a `sqlite` implementation for offline use, flip the default to `postgres` via `DATABASE_URL`.
4. Move the morning job to `launchd` with wake-from-sleep and point it at Neon. Confirm the Codex CLI session is inherited so `cli.py insight` runs unattended.
5. Create `readiness-web` as a Next.js PWA with Tailwind, shadcn/ui, Drizzle, and the Neon serverless driver. Add the single-user auth gate in front of every route.
6. Implement contract objects (`today_summary`, `history_summary`, `planned_sessions_for_day`, `integration_status`, `checkin_payload`, `daily_insight`) as typed Drizzle queries.
7. Build the `Today` page first, wire it to Neon via the typed queries, and make sure every explicit state (loading, empty, stale, offline, error, AI present/missing) renders.
8. Keep sync/scoring/insight in Python; expose UI-triggerable "Sync now" and "Regenerate insight" actions that call the same code paths (either by shelling out on the laptop during Stage 0, or by queuing a row the laptop polls).
9. Prototype the AI layer behind `cli.py insight` using `codex exec`, commit the prompt under `readiness/prompts/daily_insight_v1.md`, and confirm the JSON round-trip works end to end before wiring the Insights card to the UI.
