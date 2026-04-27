# Readiness Worker Deployment

The hosted worker consumes `job_queue` and runs the local deterministic
pipeline:

```text
intervals_refresh -> intervals sync -> score -> decision -> local Codex insight
score_decision_insight -> score -> decision -> local Codex insight
```

The worker does not require a public inbound URL. It only needs outbound
network access to Postgres, Intervals.icu, and the local AI backend in use.

## Required Environment

```text
DATABASE_URL=postgresql://...
INTERVALS_ATHLETE_ID=...
INTERVALS_API_KEY=...
APP_TIMEZONE=Europe/Lisbon
```

For local Codex insight generation, the runtime also needs `codex` installed
and authenticated. Until the cloud AI backend is designed, hosted workers may
set `AI_BACKEND=disabled` later when that switch exists, or run only sync /
score / decision jobs.

## Local Loop

```bash
python readiness/cli.py poll --loop --interval 30
```

## Docker

```bash
docker build -f readiness/Dockerfile.worker -t readiness-worker .
docker run --env-file readiness/.env readiness-worker
```

## Scheduler

A scheduler should enqueue `intervals_refresh` once every morning. The worker
heartbeat is written to `settings.worker_heartbeat` and shown on
`/integrations`.
