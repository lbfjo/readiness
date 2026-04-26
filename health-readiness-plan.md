# Health, Workout, and Readiness Plan

## Goal

Build a personal health dashboard, then evolve it into a mobile app, that gives a daily readiness view based on recovery, recent training load, sleep, HRV, resting heart rate, and workout history.

The first usable version should answer:

- What is my readiness today?
- Why is it high or low?
- What should I do today: train hard, train easy, recover, or rest?
- How are sleep, HRV, resting HR, training load, and activity trends moving over time?

## Data Sources

### Coros

Primary source for recovery and training state.

Use the local Coros MCP server for:

- Daily metrics: HRV, HRV baseline, resting HR, training load, training load ratio, tired rate, acute/chronic training indexes, VO2 max, threshold values, stamina level, distance, and duration.
- Sleep data: total sleep, deep sleep, light sleep, REM, awake time, naps, sleep HR, and sleep quality.
- Activity details: sport type, duration, distance, heart rate, calories, power, elevation, laps, zones, and training load.
- Planned workouts and structured workout library.

Setup status:

- Repository cloned to `coros-mcp/`.
- Python 3.12 virtualenv created at `coros-mcp/.venv/`.
- Package installed with `pip install -e .`.
- Codex MCP config now includes the `coros` server.

Manual step still required:

```bash
/Users/franciscobruno/dev/personal/coros-mcp/.venv/bin/coros-mcp auth
```

This will ask for your Coros email, password, and region. The full auth flow stores both web and mobile tokens; the mobile token is needed for sleep data and may log you out of the Coros mobile app. If you want to avoid that initially, run:

```bash
/Users/franciscobruno/dev/personal/coros-mcp/.venv/bin/coros-mcp auth-web
```

### Strava

Secondary source for gaps and richer activity context.

Use Strava for:

- Activities that are missing or easier to enrich from Strava.
- Social/title metadata and route context.
- Historical activity backfill if Coros data is incomplete.
- Cross-checking distance, duration, elevation, pace, and power data.

Strava should not be the primary readiness source because it generally lacks the recovery data needed for HRV, sleep, resting HR, and load-state scoring.

## Readiness Model

Use a transparent score from 0 to 100 with component explanations. Avoid a black-box score at first.

Initial weighting:

- HRV vs baseline: 30%
- Resting HR vs baseline: 20%
- Sleep duration and sleep quality: 20%
- Training load balance: 20%
- Subjective check-in: 10%

Daily output:

- `readiness_score`: 0-100
- `status`: high, moderate, low, or very low
- `recommendation`: hard training, normal training, easy aerobic, mobility, or rest
- `drivers`: top positive and negative factors
- `confidence`: high, medium, or low depending on missing data

Example rules:

- HRV below baseline and resting HR above baseline should lower readiness.
- Poor sleep with high recent training load should lower readiness more than either signal alone.
- A high training load ratio or high tired rate should bias toward easier training.
- Missing sleep data should reduce confidence rather than inventing a value.
- Subjective soreness, mood, illness, or stress should be allowed to override the recommendation.

## Product Shape

### Dashboard V1

Start as a local web dashboard before committing to a native mobile app.

Core screens:

- Today: readiness score, recommendation, drivers, sleep summary, HRV, resting HR, training load, and planned workout.
- Trends: 7-day, 28-day, and 90-day trends for HRV, resting HR, sleep, load, and activity volume.
- Activities: list and detail view with sport, load, HR zones, power zones, distance, duration, and notes.
- Calendar: planned workouts, completed workouts, rest days, and readiness overlays.
- Check-in: simple daily subjective inputs: soreness, mood, energy, stress, illness, and notes.

### Mobile App

After the scoring model is useful, wrap the same backend/API with a mobile app.

Good candidates:

- React Native with Expo if we want fast iteration and cross-platform support.
- Native iOS later if Apple Health integration becomes central.

Mobile-specific features:

- Morning readiness notification.
- Quick daily check-in.
- Today recommendation.
- Weekly training/recovery summary.
- Optional Apple Health integration later.

## Architecture

Recommended first implementation:

- Backend: small local service that talks to Coros MCP and Strava APIs.
- Storage: SQLite for raw daily metrics, activity summaries, activity details, sleep records, check-ins, and computed readiness.
- Dashboard: local web app, likely Next.js or Vite/React.
- Jobs: scheduled sync command that refreshes recent days and backfills history.

Data tables:

- `daily_metrics`
- `sleep_records`
- `activities`
- `activity_details`
- `planned_workouts`
- `subjective_checkins`
- `readiness_scores`
- `sync_runs`

Keep raw provider payloads where useful so we can recompute readiness later without refetching everything.

## Implementation Phases

### Phase 1: Data Access

- Authenticate Coros locally.
- Confirm MCP calls return daily metrics, sleep data, activity list, and activity details.
- Decide Strava integration method and authenticate it.
- Export a small sample dataset for the last 28 days.

Done when we can inspect the last 28 days of Coros metrics and activities from the local environment.

### Phase 2: Local Data Store

- Create SQLite schema.
- Add sync scripts for Coros daily metrics, sleep, activities, and activity details.
- Add idempotent upserts.
- Track sync timestamps and failures.

Done when rerunning sync produces stable local data without duplicates.

### Phase 3: Readiness Engine

- Implement baseline calculations for HRV, resting HR, sleep, and training load.
- Compute readiness score and driver explanations.
- Add confidence handling for missing data.
- Add subjective check-in support.

Done when each day has a score, status, recommendation, drivers, and confidence.

### Phase 4: Dashboard

- Build Today screen.
- Build Trends screen.
- Build Activities screen.
- Build Calendar screen.
- Add manual check-in form.

Done when the dashboard is useful every morning without reading raw provider data.

### Phase 5: Mobile

- Decide whether to reuse the web app as a PWA or build React Native.
- Add quick check-in.
- Add readiness notification.
- Add weekly summary.

Done when the phone experience is faster than opening the dashboard.

## First Validation Questions

Use the first 2-4 weeks of data to tune the model:

- Does the score match how you actually feel?
- Which metric is most predictive for you: HRV, resting HR, sleep, or load?
- Does the recommendation avoid pushing hard training on bad recovery days?
- Does it avoid being too conservative after one bad night?
- Are Coros and Strava activity records consistent enough to merge automatically?

## Immediate Next Steps

1. Run Coros authentication:

```bash
/Users/franciscobruno/dev/personal/coros-mcp/.venv/bin/coros-mcp auth
```

2. Restart Codex so the new MCP server is loaded.

3. Ask Codex to check Coros auth and pull the last 28 days of daily metrics, sleep, and activities.

4. Use that sample to define the first SQLite schema and readiness formula.

5. Add Strava once Coros data is flowing, so Strava fills gaps instead of complicating the first pass.
