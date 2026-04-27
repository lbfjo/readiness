# Readiness CLI

Local health readiness storage and scoring, with Coros and Intervals.icu data sources.

## Commands

From the **repository root** (parent of the `readiness/` folder), with a virtualenv whose packages match `readiness/requirements.txt`:

```bash
python readiness/cli.py sync --weeks 4
python readiness/cli.py morning --weeks 4
python readiness/cli.py score
python readiness/cli.py today
python readiness/cli.py checkin --energy 3 --mood 3 --soreness 2 --stress 2 --notes "Felt okay"
python readiness/cli.py report
python readiness/cli.py strava-sync --weeks 4
python readiness/cli.py strava-summary
python readiness/cli.py intervals-sync --weeks 4
python readiness/cli.py planned-today
```

If you use a separate Coros helper venv, point `python` at that interpreter; the important part is running `readiness/cli.py` so imports resolve.

Default database:

```text
readiness/data/readiness.sqlite
```

## Flow

1. `sync` pulls daily metrics, sleep, and activities from the existing Coros auth token.
2. `morning` runs the full daily flow: Coros sync, Strava sync, score, report, and today.
3. `score` recomputes readiness scores for all synced days.
4. `today` prints the latest readiness result, trend deltas, components, and drivers.
5. `checkin` records subjective inputs for a day and recomputes readiness.
6. `report` writes a static HTML dashboard to `readiness/data/report.html`.
7. `strava-sync` imports Strava activities using the token stored by the Strava MCP.
8. `strava-summary` compares daily Strava volume with Coros load fields.
9. `intervals-sync` imports Intervals.icu wellness, sleep, and planned sessions.
10. `planned-today` shows the planned sessions for a day.

The scoring model is intentionally transparent and stored with component scores and driver text so the dashboard can explain each recommendation.
Before scoring, provider-specific storage rows are normalized into a small
daily input contract. That keeps Coros, Intervals.icu, and future sources out
of the scoring rules themselves.

## Readiness Model

Scores are stored with `model_version` so future calibration changes are traceable.

Current model: `v2`

- HRV is scored against the available provider baseline when present.
- Resting HR is scored against a recent 14-day median, with the penalty capped so one high value cannot zero out the whole day.
- Sleep is scored from duration and awake time.
- Training load uses provider load ratio and fatigue/form fields.
- Subjective check-in is included when available.

## Strava

Strava credentials are managed by the Strava MCP server and stored at:

```text
~/.config/strava-mcp/config.json
```

The readiness CLI reuses that token store. Coros remains the primary readiness source; Strava is stored separately as an activity enrichment source because it can split multisport days into swim, bike, and run activities.

## Intervals.icu

Intervals wellness data is mapped into `daily_metrics` and `sleep_records` so
the current scoring engine can run without Coros. Planned sessions are stored
separately in `planned_sessions`.

The CLI reads Intervals credentials from environment variables:

```text
ATHLETE_ID=i12345
API_KEY=...
```

Equivalent variable names are also supported:

```text
INTERVALS_ATHLETE_ID=your_athlete_id
INTERVALS_API_KEY=your_api_secret
```

The CLI also auto-loads `readiness/.env` if present.

The Codex MCP server for Intervals can fetch planned sessions directly in chat. The CLI uses environment variables or `readiness/.env` so secrets do not need to be embedded in code.
