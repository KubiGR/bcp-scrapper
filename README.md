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
pnpm dev            # API on :3401, web on http://localhost:5173
```

`pnpm db:up` starts Postgres in Docker and maps it to **host port 5434** (not the default 5432),
so it can run alongside any other local Postgres. `DATABASE_URL` in `.env.example` already points
at `localhost:5434`.

The API and the database bind to localhost (127.0.0.1) only, so neither is reachable from your network.

Out of the box the API serves the sample data in `fixtures/bcp/sample` (`TOURNAMENT_SOURCE=fixtures`).
The sample fixtures are tiny (8 players, 2 rounds), so with `TOURNAMENT_SOURCE=fixtures` set both
`MIN_EVENT_ROUNDS=0` and `MIN_EVENT_PLAYERS=0` in `.env`, or the finder's size rule (4+ rounds,
20+ players by default) hides them.

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

- **Tournaments** (the start page) shows the biggest events of the last 30 days. Only big events
  (4+ rounds, 20+ players) are kept — RTTs and other small events aren't stored. Pick a size
  (All (20+) · 40+ · 100+ · 200+, or Custom min/max). **Advanced search** adds a date range, name,
  country, singles/teams and newest/biggest sorting. When a date range hasn't been fetched from BCP
  yet, the page says so and offers **Fetch** (with the approximate number of requests).
- **An event page** loads its players from BCP the first time you open it. **Fetch lists** queues
  army lists for a background worker that fetches **one list every 5 seconds**, so BCP is never
  flooded: choose **All missing lists**, or only the good results (**X-0**, **X-1 or better**, …;
  draws don't count as losses), or by final placing (**Top 8/16/32**; on team events **Top 4/8
  teams**, greyed out until the event has placings). Clicking a player shows their list; if it isn't fetched yet,
  **Fetch this list** jumps the queue. The header shows the fetch queue while it's working (click
  it to pause or resume); if BCP rejects your login the queue pauses itself — fix the token and
  restart the API (a restart clears the pause). **Export lists** saves what's fetched as `.txt` or
  `.json`.
- **Team events** also have **Rounds** (each team matchup opens to its games) and **Standings**
  (click a team for each player's games). Their data comes from **Fetch pairings**, which queues
  one request per round in the same background queue as army lists. For bracket-style events
  (e.g. GW team events) BCP has no victory points, so VP shows as "–".
- The **Players & lists** tab groups a team event's players by team, collapsibly.
- **Matchups** (on each event, and across events under **Matchups** in the header) shows how
  factions fare against each other: win rate (draws count half) or average game points, with a
  minimum-games filter and a disposition filter; click a cell for the games behind it. The
  cross-event page lists the team events in a date range; tick which count, and **Sync pairings
  for N events** fetches the missing ones in the background.
- Fetched lists are read for the **army, detachments and disposition** (GW app exports, the
  `+ FACTION KEYWORD` header format and the "Factions used" template; anything else is left
  alone). When BCP has no army for a player, or only an allegiance like "Chaos", the army from the
  list is shown with a ⚠ ("From the list"). Army names are matched to BCP's factions in any
  common wording or language ("Orkos", "Genestealer Cults", "Raven Guard"); unrecognised names are
  not used. Players & lists has a Detachment column and filter;
  games show "Army · Detachment · Disposition"; matchups filter by detachment too.
- In the list drawer, **Compact on 40kCompactor ↗** copies the list and opens
  [40kCompactor](https://desjani.github.io/40kCompactor/) in a new tab: paste it there and press
  Compact for a shorter version.
- **Meta** (header): for big events in a date range (singles, teams or both), each faction's
  players, share, win rate (draws half) and X-1-or-better rate, expandable into archetypes
  (faction + detachments from the lists); click a player count for the players and their lists.
  For team events, **What top teams bring** compares the factions of each event's top-quarter
  teams with all teams.
- **Settings → Detachment names** lists detachment names used in lists that BCP never uses
  (translations, misspellings): link each to the detachment it means, or mark it as its own. Links
  apply to every stored list at once and win over translations learned from BCP. Names that
  aren't English (accents, other alphabets, words like "de" or "und" — or marked **Not English**
  by hand) stay in the lists, but Meta counts their players as "detachment unknown".
- **Top lists** (header) searches every loaded big event in a date range for players of chosen
  factions who went X-n or better (default X-1, last 90 days), with their lists one click away.
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

`FETCH_QUEUE_INTERVAL_MS` sets the background fetch queue's pace in ms (default 5000, minimum
100): one request — an army list, an event sync or a pairings round — every interval. Keep it
gentle. The older `LIST_QUEUE_INTERVAL_MS` name still works.

**Automatic fetching** (Settings → Automatic fetching, on by default): every 10 minutes the API
queues whatever big events of the last 60 days are missing (lists from the start of a running
event, its pairings once it's over) (the event itself, its
pairings, every army list), newest first, below anything you ask for (priority −10), at the
queue's usual pace. The header shows it apart from your own jobs ("auto: 42 events left").
Turning it off drops its queued jobs. Failed jobs wait for your Retry instead of being queued
again. The latest-window catalogue is refreshed every hour while it's on. Variables:
`AUTO_FETCH_ENABLED` (`false` turns it off completely), `AUTO_FETCH_INTERVAL_MS` (600000),
`AUTO_FETCH_DAYS` (60), `AUTO_CATALOG_INTERVAL_MS` (21600000).

`MIN_EVENT_ROUNDS` (default 4) and `MIN_EVENT_PLAYERS` (default 20) are the finder's size rule:
events smaller than this are not stored or shown (RTTs and small events). Existing small events
are deleted at API startup. Set both to `0` with `TOURNAMENT_SOURCE=fixtures` so the tiny sample
fixtures show up in dev and e2e.

## Hosting

To run it on a server for yourself and a few friends (Portainer, Docker, Cloudflare Tunnel, with
logins), follow [docs/deploy/portainer.md](docs/deploy/portainer.md).

## Layout

```
apps/api        Hono API: BCP scraper (src/bcp), Postgres (src/db), sync jobs (src/sync), routes
apps/web        React 19 + React Compiler, Mantine, TanStack Router/Query
packages/shared Zod schemas and types shared by both apps
fixtures/bcp    BCP-shaped JSON: sample/ (committed), recorded/ (git-ignored)
docs/superpowers Design spec and implementation plans
deploy          Portainer stack (Postgres, app, Cloudflare Tunnel); Dockerfile at the root
```
