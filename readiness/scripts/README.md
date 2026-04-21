# Readiness — local automation

Small scripts that drive the daily readiness pipeline from the laptop.

## What runs every morning

`morning_job.sh` is the single entrypoint invoked by `launchd`. It:

1. Loads secrets from `readiness/.env` (Coros/Strava/Intervals tokens,
   `DATABASE_URL`, `APP_TIMEZONE`).
2. Runs `python readiness/cli.py morning`, which:
   - pulls Coros, Strava, and Intervals data into SQLite,
   - computes readiness scores,
   - mirrors every touched table into Postgres (Neon) via `mirror.py`.
3. Runs `python readiness/cli.py insight`, which shells out to `codex exec`
   to generate the daily AI narrative and caches it in `ai_insights`.

Logs land in `readiness/data/morning.log` (app log) plus
`readiness/data/morning.stdout.log` / `morning.stderr.log` (launchd-captured
output).

## Installing the launchd job

Templates live next to this file as `com.readiness.morning.plist.example`.
**Do not commit** edited plists with real paths into git — the repo ignores
machine-specific `com.readiness.*.plist` under `readiness/scripts/`.

1. Copy the example to LaunchAgents and replace every `PATH_TO_REPO` and
   `PATH_TO_HOME` placeholder with your checkout path and home directory
   (or edit a copy under `/tmp` first).

```bash
cp readiness/scripts/com.readiness.morning.plist.example ~/Library/LaunchAgents/com.readiness.morning.plist
# edit the plist, then:
launchctl load -w ~/Library/LaunchAgents/com.readiness.morning.plist

launchctl list | grep readiness
launchctl start com.readiness.morning
tail -f readiness/data/morning.log
```

The template uses **07:15** local time. Edit `Hour` / `Minute` before loading if
you want a different slot.

## Waking the Mac for the run

`launchd` won't wake a sleeping Mac on its own. If the laptop is closed at
07:15, the job runs on next wake. To force a wake, pair with `pmset`:

```bash
sudo pmset repeat wakeorpoweron MTWRFSU 07:00:00   # 15 min of runway
sudo pmset -g sched                                # verify
```

Set the wake time ~10–15 minutes before the launchd time so the system is
fully awake before the job fires.

## Unloading / troubleshooting

```bash
launchctl unload ~/Library/LaunchAgents/com.readiness.morning.plist
launchctl list | grep readiness      # should be gone
tail -n 200 readiness/data/morning.log
```

Common gotchas:

- `codex exec` hangs on first run if it needs to log in. Run `codex login`
  manually once before relying on the scheduled job.
- `launchd` uses a minimal PATH. Set `READINESS_EXTRA_PATH` in `readiness/.env`
  to the directory containing `codex` (or adjust `READINESS_PYTHON`). Optional
  `PATH` overrides in the plist should use generic Homebrew paths, not
  machine-specific NVM directories.
- `DATABASE_URL` must be present in `readiness/.env`. The mirror step is a
  no-op without it, so syncs still succeed locally but Postgres won't see
  them.

## Manual backfill / one-off runs

```bash
# One-shot copy SQLite -> Neon.
python readiness/scripts/backfill_sqlite_to_postgres.py \
  --sqlite readiness/data/readiness.sqlite

# Run the whole morning flow ad-hoc.
readiness/scripts/morning_job.sh --weeks 4

# Regenerate just the AI insight for today.
python readiness/cli.py insight
```
