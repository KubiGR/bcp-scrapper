# BCP Analyzer

Finds big Warhammer 40k tournaments on [Best Coast Pairings](https://www.bestcoastpairings.com),
fetches army lists on demand, and analyses how team events were paired and played.

It reads BCP's web API **as your own logged-in BCP subscriber account**, slowly (2 requests/second
by default) and only when you ask. The data is for private team analysis: please don't republish it.

## Requirements

- Node 24 LTS: `nvm use` (reads `.nvmrc`)
- pnpm via corepack: `corepack enable`
- Docker (for Postgres)

## Setup

```bash
nvm use && corepack enable
pnpm install
cp .env.example .env
pnpm db:up          # Postgres 17 in Docker, on localhost:5434
pnpm dev            # API on :3001, web on http://localhost:5173
```

`pnpm db:up` starts Postgres in Docker and maps it to **host port 5434** (not the default 5432),
so it can run alongside any other local Postgres. `DATABASE_URL` in `.env.example` already points
at `localhost:5434`.

The API and the database bind to localhost (127.0.0.1) only, so neither is reachable from your network.

Out of the box the API serves the sample data in `fixtures/bcp/sample` (`TOURNAMENT_SOURCE=fixtures`).

## Connecting to BCP

1. Log in at https://www.bestcoastpairings.com.
2. Open DevTools → Application → Local Storage → `https://www.bestcoastpairings.com`.
3. Copy the value of `AuthIdentityServiceProvider.web-app.refreshToken` into `.env` as `BCP_REFRESH_TOKEN`.
4. Set `TOURNAMENT_SOURCE=bcp` and restart `pnpm dev`.
5. Open the **Settings** page. It checks the login (refreshing it if needed) and should show **Connected**.

The API refreshes access tokens itself and stores the session in Postgres. Settings shows one of:

- **Connected**: the login works.
- **Login expired**: BCP rejected the saved refresh token. Repeat steps 1–3 and restart.
- **Not connected**: no usable token is configured. Do steps 1–4.
- **Offline · fixtures**: `TOURNAMENT_SOURCE=fixtures`, so the API serves sample data and never contacts BCP.

## Using it

- **Tournaments** (the start page) shows the biggest events of the last 30 days. Pick a size
  (All · 16+ · 40+ · 100+ · 200+, or Custom min/max). **Advanced search** adds a date range, name,
  country, singles/teams and newest/biggest sorting. When a date range hasn't been fetched from BCP
  yet, the page says so and offers **Fetch** (with the approximate number of requests).
- **An event page** loads its players from BCP the first time you open it. **Fetch lists** queues
  army lists for a background worker that fetches **one list every 5 seconds**, so BCP is never
  flooded: choose **All missing lists**, or only the good results (**X-0**, **X-1 or better**, …;
  draws don't count as losses). Clicking a player shows their list; if it isn't fetched yet,
  **Fetch this list** jumps the queue. The header shows the queue while it's working (click it to
  pause or resume); if BCP rejects your login the queue pauses itself — fix the token, restart,
  and resume. **Export lists** saves what's fetched as `.txt` or `.json`.
- No Docker? `DATABASE_URL=pglite://memory pnpm dev` runs everything in memory (lost on restart).

## Commands

| Command                                                       | What it does                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`                                                    | API and web app with reload                                                          |
| `pnpm check`                                                  | Typecheck, lint, format check and all tests (run before pushing)                     |
| `pnpm test`                                                   | All tests (no network, no Docker needed)                                             |
| `pnpm e2e`                                                    | Browser smoke test on fixtures (first time: `pnpm exec playwright install chromium`) |
| `pnpm format`                                                 | Format everything with Prettier                                                      |
| `pnpm --filter @bcp/api db:generate --name <change>`          | New migration after editing `apps/api/src/db/schema.ts`                              |
| `pnpm --filter @bcp/api record-fixtures <eventId> --lists 10` | Record a real event as anonymised fixtures in `fixtures/bcp/recorded`                |

`record-fixtures` stores the BCP session (and any rotated refresh token) in Postgres, so
**`pnpm db:up` must already be running** before you use it.

`LIST_QUEUE_INTERVAL_MS` sets the background list pace in ms (default 5000). Keep it gentle.

## Layout

```
apps/api        Hono API: BCP scraper (src/bcp), Postgres (src/db), sync jobs (src/sync), routes
apps/web        React 19 + React Compiler, Mantine, TanStack Router/Query
packages/shared Zod schemas and types shared by both apps
fixtures/bcp    BCP-shaped JSON: sample/ (committed), recorded/ (git-ignored)
docs/superpowers Design spec and implementation plans
```
