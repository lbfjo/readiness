# Readiness Web

Next.js 16 + React 19 PWA for the personal readiness engine.

## Stack

- Next.js App Router, TypeScript strict
- Tailwind v4 (tokens in `app/globals.css`)
- Drizzle ORM + `@neondatabase/serverless`
- shadcn-style primitives in `components/`
- PWA manifest at `public/manifest.webmanifest`

## Environment

Copy `.env.example` to `.env.local` and fill in:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
APP_ACCESS_SECRET=some-random-string      # enables the single-user gate
APP_TIMEZONE=Europe/London                # canonical "today" timezone
```

When `APP_ACCESS_SECRET` is unset the gate is disabled (useful for local dev).

## Scripts

| Script               | What it does                                  |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Run the app on `http://localhost:3000`        |
| `npm run build`      | Production build                              |
| `npm run typecheck`  | `tsc --noEmit`                                |
| `npm run format`     | Prettier + Tailwind class sort                |
| `npm run db:generate`| Generate SQL migrations from `lib/db/schema.ts`|
| `npm run db:push`    | Apply schema directly to the DB (dev only)    |
| `npm run db:migrate` | Apply committed migrations                    |
| `npm run db:studio`  | Drizzle Studio UI                             |

## First run

1. Provision a Neon project, capture `DATABASE_URL`.
2. `npm install`
3. `npm run db:push` to create the schema on Neon.
4. Optional: `python readiness/scripts/backfill_sqlite_to_postgres.py --sqlite readiness/data/readiness.sqlite` to copy history.
5. `npm run dev` and visit `/today`.

## Structure

```
app/
  today/         # server component, reads TodaySummary
  history/       # placeholder
  check-in/      # placeholder
  integrations/  # placeholder
  settings/      # placeholder
  login/         # single-user gate
  api/login/     # cookie issuer
components/      # AppShell, Card, EmptyState, ...
lib/
  db/            # Drizzle schema + client (source of truth)
  contracts/     # typed query functions used by routes
  time.ts        # timezone / today rollover
  utils.ts       # cn()
middleware.ts    # auth gate, redirects to /login
```
