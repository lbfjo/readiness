# Readiness

Personal training readiness stack: a **Python CLI** (Coros, Strava, Intervals, scoring, Codex powered insights) and a **Next.js** dashboard backed by Postgres (Neon or any PostgreSQL).

This repository is safe to publish: **no API keys, tokens, or connection strings are committed.** Copy the included `.env.example` files and fill them locally.

## Repository layout

| Path | Purpose |
|------|---------|
| `readiness/` | Python engine (`cli.py`), SQLite local store, mirror to Postgres, `launchd` scripts |
| `readiness-web/` | Next.js 16 app (Drizzle + Neon HTTP driver) |

Optional sibling folders (Strava / Coros MCP helpers) are **not** required for the web app to build in CI; wire them on your machine for full data sync.

## Quick start (contributors)

1. **Clone** this repo (do not paste secrets into issues or commits).

2. **Web app**
   ```bash
   cd readiness-web
   cp .env.example .env.local
   # Edit .env.local — at minimum DATABASE_URL for Postgres
   npm install
   npm run db:push
   npm run dev
   ```

3. **Python CLI**
   ```bash
   cd readiness
   cp .env.example .env
   # Edit .env — DATABASE_URL, optional Intervals keys
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   python readiness/cli.py --help
   ```
   Run commands from the **repository root** so imports like `readiness.cli` resolve (`python readiness/cli.py today`).

4. **macOS automation** — see `readiness/scripts/README.md`. Install from the **template** plists (`*.plist.example`), not from machine-specific paths.

## Security

See [SECURITY.md](./SECURITY.md). Never commit `.env`, `.env.local`, SQLite files under `readiness/data/`, or LaunchAgent plists with your home directory baked in.

## Documentation

- Feature inventory: [FEATURES.md](./FEATURES.md)
- Product / roadmap notes: [readiness/APP_PLAN.md](./readiness/APP_PLAN.md)
- Launchd & scripts: [readiness/scripts/README.md](./readiness/scripts/README.md)

## License

MIT — see [LICENSE](./LICENSE).
