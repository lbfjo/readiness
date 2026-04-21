# Health Readiness Current State

## Coros Connection

Coros MCP is authenticated and working.

- Web API: authenticated
- Region: `eu`
- Mobile API: authenticated
- Sleep data: available

## Pulled Data

Sample range: `2026-03-23` to `2026-04-20`

- Daily metric records: 29
- Sleep records: 24
- Activities listed: 24

The current Coros data is enough to start the readiness engine without Strava.

## Today's Readiness Snapshot

Date: `2026-04-20`

Signals:

- HRV: `75 ms`
- HRV baseline: `69 ms`
- Resting HR: `67 bpm`
- Sleep: `497 min` / `8h17m`
- Deep sleep: `111 min`
- REM sleep: `135 min`
- Awake time: `7 min`
- Training load: `18`
- Training load ratio: `0.90`
- Tired rate: `-8`
- Acute training index: `76`
- Chronic training index: `84`

Initial interpretation:

- Recovery looks mostly good because HRV is above baseline, sleep duration is strong, sleep fragmentation is low, and training load ratio is controlled.
- Resting HR is the main caution flag today because it is high relative to the recent values in the sample.
- Training load state is not overloaded today.

Provisional readiness:

- Score: `76 / 100`
- Status: `moderate-high`
- Recommendation: normal training is reasonable, but avoid forcing high intensity if resting HR stays elevated or subjective fatigue is high.
- Confidence: medium-high

This is intentionally provisional. The first app version should compute this from stored data and show the drivers rather than hard-code fixed thresholds.

## Recent Pattern

Important recent load spike:

- `2026-04-12`: Setúbal Triathlon
- Duration: `5h32m58s`
- Distance: `111.4 km`
- Training load: `1121`
- Training load ratio that day: `2.04`
- Tired rate that day: `100`

Recovery after that spike:

- `2026-04-13`: training load ratio `1.88`, tired rate `85`
- `2026-04-14`: training load ratio `1.65`, tired rate `62`
- `2026-04-15`: training load ratio `1.46`, tired rate `42`
- `2026-04-16`: training load ratio `1.29`, tired rate `26`
- `2026-04-17`: training load ratio `1.15`, tired rate `14`
- `2026-04-18`: training load ratio `1.02`, tired rate `2`
- `2026-04-20`: training load ratio `0.90`, tired rate `-8`

That pattern is useful for the readiness model: after a very large event, training load and tired rate decay over several days and should keep readiness conservative until they normalize.

## What To Build Next

Build the local data layer first, then the dashboard.

### Step 1: Local Data Store

Create a small SQLite-backed project with tables:

- `daily_metrics`
- `sleep_records`
- `activities`
- `readiness_scores`
- `sync_runs`

Use idempotent upserts keyed by date or provider activity ID.

### Step 2: Readiness Engine

First scoring model:

- HRV vs baseline: 30%
- Resting HR vs recent baseline: 20%
- Sleep duration and sleep quality: 20%
- Training load ratio and tired rate: 20%
- Subjective check-in: 10%

Each score should store:

- final score
- status label
- recommendation
- positive drivers
- caution drivers
- confidence

### Step 3: Dashboard

Build a web dashboard with:

- Today readiness card
- Driver explanation
- Sleep and HRV trends
- Training load trend
- Recent activities
- Daily subjective check-in

### Step 4: Strava Later

Add Strava after Coros sync and readiness scoring work.

Use it for:

- route/title enrichment
- activity backfill
- cross-checking distance, duration, elevation, and activity naming

Do not make Strava a readiness dependency in V1.
