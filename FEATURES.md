# Readiness — Built Features

Snapshot of everything that is wired and working today across the two
sub-projects:

- `readiness/` — Python engine (CLI, scoring, syncs, AI insight, mirror, launchd)
- `readiness-web/` — Next.js 16 PWA deployed on Vercel-ready stack

Storage topology right now:

- **SQLite** (`readiness/data/readiness.sqlite`) — local compute store for the
  Python engine; the scoring pipeline reads/writes this.
- **Neon Postgres** — cloud source of truth the web app reads from. Every
  Python write that modifies user-visible data is mirrored here on success.
- **Drizzle** (TS, `readiness-web/lib/db/schema.ts`) is the schema source of
  truth. A Python mirror lives in `health_readiness/schema_py.py`.

---

## 1. Web app (`readiness-web`)

### Stack

- Next.js 16 (App Router) + React 19, TypeScript in strict mode
- Tailwind CSS v4, shadcn-style primitives, Recharts (ready), lucide-react icons
- Drizzle ORM + `@neondatabase/serverless` HTTP driver
- PWA manifest + theme color configured

### Pages / routes

| Route       | Status        | What it does |
|-------------|---------------|--------------|
| `/today`    | **Live**      | Dashboard with hero readiness ring, driver tiles (HRV, RHR, sleep, training load), **Planned** card (Intervals, with sport-matched "Done" pill against today's Strava activities), **Today's Workouts** list (Strava), recommendation, AI Insights panel, and a **Refresh** button that enqueues a sync/score/insight job. The check-in chip links to `/check-in`. |
| `/login`    | UI only       | Login form styled to match the design system; submits to `/api/login` (validation route not yet wired) |
| `/history`  | **Live**      | Trends screen. Hero readiness line chart (0–100) with status + delta line, 5 metric cards with sparklines (HRV, RHR, Sleep, Training Load, Load Ratio) showing latest value + delta vs early window baseline + improvement/regression color, and a today mini-stat row. Range toggle `?range=14d` (default) / `?range=90d`. All charts are hand-rolled SVG (no Recharts dep) and render missing days as explicit gaps — the line breaks instead of interpolating, so sync issues are visible. |
| `/activity/[id]` | **Live** | Strava activity drill-down. Each card under **Today's Workouts** on `/today` links here. Shows decoded **route polyline** (SVG, no map tiles), summary stats from columns + `raw_json` (distance, moving/elapsed time, elevation, HR, suffer, kJ, power when present), optional social counts, device name + flags, **Open in Strava** deep link, and a lap-splits table when `splits_metric` / `splits_standard` exist in the stored payload (usually empty until a future single-activity API fetch). |
| `/check-in` | **Live**      | Phone-friendly form: 1–5 Likert buttons for energy / mood / soreness / stress, illness toggle, notes. Pre-fills today's row; upserts via a server action with zod validation; next `cli.py score` picks it up via reverse-sync. Below the form, a **14-day heatmap** grids energy / mood / soreness / stress as a timeline, with illness flags in a header row — accent colour for higher-is-better dimensions, caution for higher-is-worse, faint placeholder tiles for missing days so gaps are visible. |
| `/sync`     | Not built     | Placeholder in nav |
| `/settings` | Not built     | Placeholder in nav |

### Shell + design system

- `AppShell` component with responsive nav: sidebar on desktop, bottom tab bar
  on mobile. Hides on `/login`.
- Custom SVG logo + wordmark in `components/logo.tsx` (stylized "R" with
  lightning bolt).
- Typography: Unbounded (display) + Inter (body) from Google Fonts.
- Dark palette: navy background with lime accent, subtle radial gradients.

### `/today` explicit states

All of these render gracefully (no crashes):

- **Happy path** — score + drivers + recommendation + AI narrative
- **DB unreachable / `DATABASE_URL` unset** — "Not connected yet" panel with
  setup hint, nav still functional
- **No readiness score yet for today** — empty-state card
- **No AI insight yet** — "AI summary will appear after the morning run"
- **Stale sync** — last-sync timestamp surfaced via `formatRelative`

### Data layer

- **Lazy Drizzle client** (`lib/db/client.ts`) — only connects on first
  `getDb()` call so pages can render even without `DATABASE_URL`.
- **Typed contracts** — every page has its own query module:
  - `lib/contracts/today.ts` · `getTodaySummary(date)` for `/today`
  - `lib/contracts/trends.ts` · `getTrends(from, to)` for `/history` (joins
    `readiness_scores` + `daily_metrics` + `sleep_records` +
    `subjective_checkins`, pads missing calendar days so charts render real
    gaps instead of interpolated lines)
  - `lib/contracts/checkin.ts` · `getCheckin`/`upsertCheckin` for `/check-in`
  - `lib/contracts/jobs.ts` · `enqueueJob`/`getJob`/`getLatestJob` for the
    web-to-laptop refresh queue
  - `lib/contracts/strava-activity.ts` · `getStravaActivity(id)` for
    `/activity/[id]`
- **Schema & migrations** — `drizzle.config.ts` loads `.env` + `.env.local`
  the way Next does; `npm run db:push --force` applies schema to Neon.

### Auth gate

- `proxy.ts` (formerly `middleware.ts`) redirects unauthenticated requests to
  `/login` whenever `APP_ACCESS_SECRET` is set. POST validation endpoint is
  pending.

---

## 2. Python engine (`readiness/`)

### `cli.py` subcommands

Run as `python3.13 readiness/cli.py <subcommand>`. Requires `readiness/.env`
with `DATABASE_URL`, `INTERVALS_*`, Coros/Strava tokens (where relevant).

| Command                   | What it does                                                                  | Mirrors to Neon |
|---------------------------|-------------------------------------------------------------------------------|-----------------|
| `sync [--weeks N]`        | Pulls Coros daily metrics, sleep, activities; recomputes scores; prints today | yes             |
| `morning`                 | `sync` + `strava-sync` + `intervals-sync` + `score` + `report` + `today`      | yes             |
| `score`                   | Recompute readiness scores from whatever data exists                          | yes             |
| `today`                   | Print the latest readiness report (score, metrics, drivers, planned session)  | no              |
| `report --output <path>`  | Generate static HTML dashboard                                                | no              |
| `strava-sync [--weeks N]` | Pull Strava activities                                                        | yes             |
| `strava-summary`          | Print Strava daily summary                                                    | no              |
| `intervals-sync`          | Pull planned sessions from Intervals.icu                                      | yes             |
| `intervals-import <path>` | Import planned sessions from a JSON file                                      | yes             |
| `planned-today [--date]`  | Show today's (or given day's) planned sessions                                | no              |
| `checkin`                 | Subjective daily check-in (energy/mood/soreness/stress/illness/notes) + rescore + today | yes  |
| `insight`                 | Generate AI narrative for the latest (or given) score via Codex CLI           | yes (ai_insights) |
| `poll [--loop] [--interval N]` | Claim pending `job_queue` rows from Postgres and dispatch sync/score/insight/refresh locally | yes (via dispatchers) |

Flags on `insight`:

- `--date YYYYMMDD` — regenerate for a historical day
- `--model <slug>` — override the Codex model
- `--dry-run` — print the context JSON that would be sent to Codex

### AI insight pipeline

- **Backend**: `CodexInsightBackend` (`health_readiness/insight.py`) shells out
  to `codex exec --output-last-message <file>`, with `stdin=DEVNULL` so the
  CLI doesn't hang waiting for more input.
- **Prompt**: versioned at `readiness/prompts/daily_insight_v1.md`; output is a
  strict JSON object (`summary`, `talking_points`, `session_advice`,
  `anomalies`).
- **Context builder** (`health_readiness/insight_context.py`): pulls
  today's scored row + 14-day trend + planned session + last check-in from
  SQLite.
- **Cache**: results upserted into `ai_insights` via the repo layer. The web
  app reads the latest row per date.
- **Degraded modes**: missing metrics surface as "no data" in the narrative;
  missing `DATABASE_URL` skips the cache write silently.

### Reverse-sync (web → Python)

`health_readiness/checkin_sync.py` pulls subjective check-ins from Postgres
into SQLite before every score recompute. Triggered automatically at the top
of `command_score` (which `command_morning` also calls).

- Compares `updated_at` per date; only pulls rows that are strictly newer in
  Postgres.
- Missing `DATABASE_URL` or any connection failure degrades silently — offline
  runs keep working.
- Idempotent: re-running `cli.py score` a second time prints nothing because
  the local copy is already as fresh as the remote.

This closes the "phone submits check-in → morning score picks it up" loop
without needing the job queue poller.

### Mirror layer (transitional)

`health_readiness/mirror.py` upserts SQLite rows into Postgres after every
write-side CLI command. It handles:

- `postgresql://` → `postgresql+psycopg://` URL promotion
- Unix-epoch → `datetime` coercion for legacy timestamp columns
- JSON string → JSONB for `raw_json`/`*_json` columns
- `ON CONFLICT DO UPDATE` upsert on primary keys
- Default-fill for NOT NULL columns that exist in Postgres but not SQLite
  (e.g. `sync_runs.source` → `"legacy"`)
- `sync_runs` rows with source-provided ids (SQLite autoincrement)

This bridges the current SQLite-first compute with the Postgres-first frontend
while we prepare the full SQLAlchemy port.

### Repo abstraction

`health_readiness/repos/` provides protocol-based repositories so the engine
can one day swap backends without touching features.

- `base.py` — protocols: `SyncRunsRepo`, `ReadinessRepo`, `CheckinsRepo`,
  `PlannedSessionsRepo`, `AiInsightsRepo`, `SettingsRepo`, `JobQueueRepo`,
  and the `RepoBundle` dataclass that carries them.
- `factory.py` — reads `DATABASE_URL`, returns a Postgres or SQLite bundle.
- `postgres_impl.py` — SQLAlchemy implementations for all protocols except
  `PlannedSessionsRepo.upsert_many` (filled in when Intervals sync is moved).
- `sqlite_impl.py` — stubbed; concrete impls wired as features migrate.

Used today by `cli.py insight` (writes through `AiInsightsRepo`).

---

## 3. Data model (Neon)

All 11 tables live in `readiness-web/lib/db/schema.ts` with a Python mirror in
`readiness/health_readiness/schema_py.py`:

| Table                 | Purpose |
|-----------------------|---------|
| `daily_metrics`       | Coros daily metrics (HRV, RHR, training load, etc.) |
| `sleep_records`       | Coros sleep sessions per day |
| `activities`          | Coros workouts |
| `strava_activities`   | Strava workouts (separate table for different schema) |
| `planned_sessions`    | Intervals.icu planned workouts |
| `subjective_checkins` | Manual check-ins (energy/mood/soreness/stress) |
| `readiness_scores`    | Deterministic score + components + drivers |
| `sync_runs`           | Audit log of every sync attempt (source, window, counts, errors) |
| `ai_insights`         | Cached Codex outputs keyed by (date, prompt_version, model) |
| `settings`            | Single-row key/value JSON blobs (reserved) |
| `job_queue`           | Web → laptop command queue (reserved, not polled yet) |

Dates use compact `YYYYMMDD` format throughout, matching the legacy Python
code. JSON columns are `JSONB` on Postgres, `TEXT` on SQLite.

---

## 4. Local automation (`launchd`)

Two LaunchAgents, each a thin wrapper around the Python CLI:

1. **Morning batch** — install from `com.readiness.morning.plist.example`
   - Shell: `readiness/scripts/morning_job.sh`
   - Runs `cli.py morning` + `cli.py insight` at **07:15 local** daily.
   - Logs to `readiness/data/morning.log`.

2. **Job-queue poller** — install from `com.readiness.poller.plist.example`
   - Shell: `readiness/scripts/poll_job.sh`
   - Runs `cli.py poll --once` every **60 seconds**.
   - Drains any pending rows the web app enqueued (e.g. the `/today` Refresh
     button). Empty queue = fast exit.
   - Logs to `readiness/data/poller.log`.

Copy the **example** plists, replace `PATH_TO_REPO` and `PATH_TO_HOME` with your
machine, then install:

```bash
cp readiness/scripts/com.readiness.morning.plist.example ~/Library/LaunchAgents/com.readiness.morning.plist
cp readiness/scripts/com.readiness.poller.plist.example  ~/Library/LaunchAgents/com.readiness.poller.plist
# Edit both plists — paths must match your checkout and home directory.
launchctl load -w ~/Library/LaunchAgents/com.readiness.morning.plist
launchctl load -w ~/Library/LaunchAgents/com.readiness.poller.plist
launchctl start com.readiness.morning   # trigger once to verify
```

`readiness/scripts/README.md` covers uninstall, `pmset repeat
wakeorpoweron` to wake the Mac for the 07:15 run, and log locations.

---

## 5. End-to-end flows

### Flow A — Automated morning (primary happy path)

1. **07:00** — `pmset` wakes the Mac.
2. **07:15** — `launchd` fires `morning_job.sh`.
3. Python `cli.py morning` pulls Coros / Strava / Intervals into SQLite.
4. Scoring runs; new `readiness_scores` rows land in SQLite.
5. `mirror.py` pushes every touched table into Neon.
6. Python `cli.py insight` builds the prompt context from SQLite, calls
   `codex exec`, parses the JSON result, and caches it in `ai_insights` on
   Neon via `AiInsightsRepo`.
7. **Any time** — user opens the web app on phone/laptop. `/today` renders the
   new score + AI narrative from Neon. Typical render time: ~400 ms to first
   byte on Vercel + Neon HTTP driver.

### Flow B — Manual check-in (CLI)

1. User runs `python3.13 readiness/cli.py checkin --energy 4 --mood 4
   --soreness 2 --stress 2 --notes "…"`.
2. Check-in upserted into SQLite → mirrored to Neon.
3. Scoring re-runs (subjective is a score component) → new score mirrored.
4. CLI prints `today` view inline.
5. Next `/today` refresh shows the updated score.
6. Optional: `python3.13 readiness/cli.py insight` regenerates the AI
   narrative with the new check-in in the context.

### Flow B' — Web check-in (phone, mid-day)

1. User opens `/check-in` on phone (PWA-installable). Today's existing row is
   pre-filled if present.
2. User taps sliders, submits. Server action validates with zod and upserts
   into Neon.
3. `/check-in` and `/today` are both revalidated — the "Checked in" chip
   flips state immediately on `/today`.
4. Score doesn't change yet; the web side never computes the score.
5. When the user taps **Refresh** on `/today` (or the next 07:15 run, or the
   next poller tick after any enqueued job), `cli.py score` runs,
   `checkin_sync.py` pulls the web row into SQLite, scoring recomputes, and
   the new score is mirrored back to Neon.

### Flow C' — Post-workout refresh (the "check app after training" flow)

The flow the user cares about most: *check in at 7am → ride at noon → open
the app → see the ride and an updated score/insight*.

1. User finishes a ride. Strava auto-uploads.
2. User opens `/today` and taps **Refresh**.
3. Web POSTs `{ kind: "refresh" }` to `/api/jobs`, inserts a row in
   `job_queue`, and starts polling `/api/jobs/:id` every 2 s. Status line
   shows "queued…".
4. Within ~60 s the laptop's `com.readiness.poller` agent fires
   `cli.py poll --once`. It claims the row (`FOR UPDATE SKIP LOCKED`),
   dispatches to `_dispatch_refresh`:
   - `command_sync` → fresh Coros + Strava + Intervals data into SQLite +
     mirrored to Neon
   - `command_score` → reverse-sync check-ins, recompute, mirror
   - `command_insight` → rebuild context (now including `completed_today`
     with the new ride), call Codex, cache in `ai_insights`
5. Poller marks the job `succeeded`; `finished_at` timestamp written.
6. Next `/api/jobs/:id` poll returns terminal status. The client calls
   `router.refresh()`; `/today` re-fetches and now shows:
   - The ride in "Today's Workouts" with distance / duration / HR / suffer
   - The matching **"Planned"** card flips to a **Done** pill, with a
     "Logged as …" footnote tying the planned Z1 run to the actual trail run
   - A new score that accounts for the extra training load
   - An AI insight that explicitly references both ("You already logged a
     67 min trail run with moderate strain… treat the planned 1h Z1 run as
     optional at most.")

Latency: typically 20–80 s end-to-end, dominated by Coros + Codex round
trips. Floor is the 60 s poller interval if the Mac had to wake up.

### Flow C — Historical deep-dive

1. User runs `python3.13 readiness/cli.py insight --date 20260418`.
2. Context builder assembles that day's scored row + its 14-day trailing
   trend + planned session + any check-in.
3. Codex generates a narrative tied to that specific date.
4. Result cached in `ai_insights` for the historical date. `/history`
   surfaces the score/HRV/RHR/sleep/load lines for that day; a future
   drill-down will link the cached insight.

### Flow D — Fresh laptop / data loss recovery

1. `npm run db:push --force` on an empty Neon project recreates all 11 tables.
2. `python3.13 readiness/scripts/backfill_sqlite_to_postgres.py --sqlite
   readiness/data/readiness.sqlite` copies every historical row into Neon.
3. One `cli.py morning` run tops up today's data.
4. Web app is fully functional immediately.

### Flow E — Development loop

1. `cd readiness-web && npm run dev` — Next.js on `localhost:3000`.
2. Edit a page; HMR reflects immediately.
3. Trigger server-side data changes with any of the Python CLI commands; hit
   refresh on `/today`.
4. Inspect Neon directly with the `scripts/list-tables.mjs` helper or
   one-off `node -e` queries against the serverless driver.

---

## 6. What is _not_ built yet

Tracked in `APP_PLAN.md` as the next tranche. Nothing below is wired, so
don't rely on it.

- **Auth gate finish** — `/api/login` endpoint to validate `APP_ACCESS_SECRET`
  and set a cookie; currently only the redirect middleware exists.
- **Sync / Integrations screen** — status + re-auth buttons.
- **Driver drill-down** — tap a Recovery Drivers tile on `/today` →
  `/metrics/:driver` with that metric's 30-day chart and an explanation of
  what "good" looks like.
- **Settings screen** — timezone, AI toggles, prompt version selector.
- **Full `db.py` port to SQLAlchemy** — retires `mirror.py` and makes Postgres
  the single primary store. Required before removing SQLite.
- **Drift check (`pnpm check:schema`)** — compare live Postgres introspection
  against Drizzle + SQLAlchemy definitions.
- **Vercel deployment** — the app is production-ready locally but hasn't been
  pushed; rotate the Neon password first.
