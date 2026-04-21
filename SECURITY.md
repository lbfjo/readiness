# Security policy

## Reporting issues

If you discover a security vulnerability, please **do not** open a public GitHub issue. Contact the repository owner privately with enough detail to reproduce the problem.

## Secrets & configuration

This project is designed so that **credentials never belong in git**:

- **Postgres**: `DATABASE_URL` in `readiness-web/.env.local` and/or `readiness/.env`
- **App gate (optional)**: `APP_ACCESS_SECRET` in `readiness-web/.env.local`
- **Intervals.icu**: `INTERVALS_ATHLETE_ID` / `INTERVALS_API_KEY` in `readiness/.env`
- **Strava / Coros**: tokens are read from local tool config under `~/.config/` (see `readiness/README.md`), not from this repository

Commits should only ever include **`.env.example`** templates with placeholder values.

## Local data

Do not commit:

- `readiness/data/*.sqlite` (local database)
- `readiness/data/*.log`
- Generated `readiness/data/report.html` if it contains personal health data

These paths are listed in `.gitignore`.

## LaunchAgent plists

Use the committed `readiness/scripts/*.plist.example` files and substitute your own paths. Machine-specific plists under `readiness/scripts/` are gitignored to avoid accidentally publishing home directory paths.

## Dependency hygiene

Keep `npm` and `pip` dependencies up to date for security patches. Run `npm audit` / `pip audit` periodically in your own environment.

## Disclaimer

This is personal / POC software. It is not certified medical or coaching advice; use at your own risk.
