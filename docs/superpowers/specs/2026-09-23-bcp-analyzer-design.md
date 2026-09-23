# BCP Analyzer — Design Spec

- **Date:** 2026-09-23 (rev. 2: scraping + Postgres)
- **Status:** Approved design, pending spec review
- **Scope:** Warhammer 40k only

## 1. Goals

1. **Tournament finder & list fetching** — find large 40k tournaments on Best Coast Pairings (BCP) and, on demand, fetch and export every player's army list.
2. **Team event analysis** — for team events, show how pairings were made each round and what the results were: team standings, round-by-round matchups, per-player contribution, and faction-vs-faction matchup statistics (per event and aggregated across events).

### Non-goals (for now)

- Parsing army lists into units/points (lists are stored as raw text).
- Recording the pairing _process_ (defender / attacker / refusal picks). BCP does not expose it; the data model leaves room for it later.
- Game systems other than Warhammer 40k.
- Authentication for our own app, public hosting, running more than one API instance.

### Audience & deployment

A small team. It runs locally with `pnpm dev` + Docker Compose (Postgres) for now, and is structured so it can later be deployed as containers with a managed Postgres and given simple auth without restructuring.

## 2. Data source: scraping BCP's web API

BCP has no public API. Its website is a single-page app that loads JSON from `https://newprod-api.bestcoastpairings.com`. We read the same JSON from our server. We do not scrape HTML.

**Account:** the user has a BCP subscription. **Every request is made as that logged-in account**, including requests that happen to work without a login. We only read data the subscription entitles the user to see.

### Verified endpoints (probed 2026-09-23 against AdeptiCon 2026 40K Teams, id `YlZ0Eu7zlVn3`)

Required headers: `client-id: web-app`, `env: bcp`, `accept: application/json`. With a login, also `Authorization: Bearer <accessToken>`.

| Data             | Endpoint                                                                                                               | Notes                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event search     | `GET /v1/events?gameType=1&startDate&endDate&sortKey=eventDate&sortAscending=false&limit=100[&searchString][&nextKey]` | Paged via `nextKey`. The server ignores `minPlayers` and has no team filter, so we filter locally. `gameType=1` is 40k.                                                                                               |
| Event detail     | `GET /v2/events/{id}`                                                                                                  |                                                                                                                                                                                                                       |
| Players          | `GET /v1/events/{id}/players?placings=true`                                                                            | `{active, deleted}`. Faction, `teamId`, `placing`, `listId`, `total_metrics`. About 1.1 MB for 432 players.                                                                                                           |
| Teams            | `GET /v1/events/{id}/teamplayers?placings=true`                                                                        | `{active, deleted}`. `name`, `placing`, `captainId`, `total_metrics`.                                                                                                                                                 |
| Team matchups    | `GET /v1/events/{id}/pairings?round=N&pairingType=TeamPairing`                                                         | `teamPlayer1/2`, `table`, and each side's `result` and `points` (e.g. 17–3).                                                                                                                                          |
| Individual games | `GET /v1/pairings?eventId={id}&round=N&pairingType=Pairing&limit=500`                                                  | `{data, nextKey}`. `teamPairingId` links the game to its team matchup. `metaData` holds `p1/p2-victoryPoints`, `-primary`, `-secondary`, `-firstTurn`, `-gamePoints` and `-gameResult` (0 = loss, 1 = draw, 2 = win). |
| Army list        | `GET /v1/armylists/{listId}`                                                                                           | **Requires a login** (returns 401 without one).                                                                                                                                                                       |

### Authentication

- BCP signs users in with OAuth (the SPA calls `/oauth/token` and receives `accessToken`, `idToken` and a refresh token).
- **Setup (one-off):** the user logs in at bestcoastpairings.com, copies the refresh token from the browser's local storage into `.env` as `BCP_REFRESH_TOKEN`, and the API exchanges it for access tokens automatically.
- **To verify in step 1 of implementation:** the exact refresh-token request. If automatic refresh doesn't work, fall back to the user pasting `BCP_ACCESS_TOKEN`, and show a clear "BCP session expired — update your token" error when BCP returns 401.
- Tokens are never logged or sent to the browser.

## 3. Known risks

- **BCP changes its internal API without notice.** Mitigations:
  - All BCP code lives in one module (`apps/api/src/bcp/`).
  - Every response is validated with Zod, so a change fails loudly instead of producing wrong numbers.
  - Raw responses are stored in the database, so data can be re-processed without re-fetching.
- **Terms of service.** Scraping is not explicitly allowed. We keep the load low: rate limiting, fetching only when the user asks, caching, and requests made as the user's own subscribed account. We never republish the data.
- **Pairing-process data** is not available from BCP (see Non-goals).
- **Node version.** The toolchain requires Node ≥ 20.19. The project pins the current LTS, **Node 24 LTS (Krypton)**, via `.nvmrc`.

## 4. Architecture

pnpm monorepo:

```
React (apps/web) ──HTTP/JSON──▶ Hono API (apps/api) ──▶ TournamentSource ──▶ BCP web API
                                      │
                                      └──▶ Postgres (Drizzle ORM)
```

- The browser talks only to our API, never to BCP directly. This avoids cross-origin (CORS) problems and keeps the BCP tokens on the server.
- The API serves data from Postgres and calls BCP only when the user explicitly syncs or refreshes.
- `packages/shared` holds Zod schemas and the TypeScript types derived from them. Both apps import from it, so the web app and the API cannot disagree about data shapes.

### Tech stack

| Area         | Choice                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Language     | TypeScript (strict, `noUncheckedIndexedAccess`, no `any`)                                                                    |
| Runtime      | Node 24 LTS (Krypton), pnpm workspaces                                                                                       |
| Web          | React 19 + React Compiler 1.0, Vite                                                                                          |
| Routing      | TanStack Router (file-based, type-safe search params)                                                                        |
| Server state | TanStack Query                                                                                                               |
| UI           | Mantine (core, dates, notifications, charts), `mantine-datatable`, CSS Modules + `postcss-preset-mantine`                    |
| API          | Hono on Node (`@hono/node-server`)                                                                                           |
| DB           | **Postgres 17** (Docker Compose locally) + Drizzle ORM & drizzle-kit migrations; **PGlite** for tests                        |
| Validation   | Zod                                                                                                                          |
| Logging      | pino                                                                                                                         |
| Lint         | ESLint flat config, `typescript-eslint` strict type-checked, `eslint-plugin-react-hooks` (includes the React Compiler rules) |
| Format       | Prettier                                                                                                                     |
| Tests        | Vitest, React Testing Library, Playwright (single smoke test)                                                                |
| Git hooks    | Husky + lint-staged                                                                                                          |

**`mantine-datatable` fallback:** if it doesn't support the current Mantine major version, use TanStack Table rendered with Mantine's `Table`.

## 5. Data model (Postgres)

Every table that stores BCP data keeps `bcp_id` (unique) and a `raw jsonb` column with the original BCP object. The typed columns are extracted from `raw` by the mappers.

| Table           | Columns (key)                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events`        | `id`, `bcp_id`, `name`, `start_date`, `end_date`, `country`, `city`, `player_count`, `team_count` (null until event detail is synced), `is_team_event`, `round_count`, `ended`, `hide_lists`, `last_synced_at`, `raw`                       |
| `teams`         | `id`, `event_id`, `bcp_id`, `name`, `placing`, `raw`                                                                                                                                                                                        |
| `players`       | `id`, `event_id`, `team_id` (nullable), `bcp_id`, `name`, `faction`, `parent_faction`, `placing`, `wins`, `losses`, `draws`, `list_bcp_id`, `raw`                                                                                           |
| `army_lists`    | `id`, `player_id` (unique), `bcp_id`, `raw_text`, `fetched_at`, `raw`                                                                                                                                                                       |
| `team_matchups` | `id`, `event_id`, `bcp_id`, `round`, `table_no`, `team_a_id`, `team_b_id`, `points_a`, `points_b`, `result_a`, `raw`                                                                                                                        |
| `games`         | `id`, `event_id`, `bcp_id`, `round`, `team_matchup_id` (nullable), `table_no`, `player_a_id`, `player_b_id`, `vp_a`, `vp_b`, `primary_a/b`, `secondary_a/b`, `game_points_a/b`, `first_turn` (a/b/null), `result` (a_win/b_win/draw), `raw` |
| `sync_runs`     | `id`, `event_id` (nullable), `kind` (catalog/event/lists/pairings), `status` (queued/running/succeeded/failed), `total`, `done`, `failed`, `error`, `started_at`, `finished_at`                                                             |

- Singles and team events share `games`, so faction statistics can draw on both.
- `team_matchups.points_*` stores BCP's team score (e.g. 17–3). `games.game_points_*` stores the per-game points that make up that score.
- Indexes on `events(start_date)`, `events(player_count)`, `games(event_id, round)` and `players(event_id, faction)`.
- A future `pairing_picks` table (round, team, role, player) can be added without changing existing tables.

## 6. BCP adapter (`apps/api/src/bcp/`)

```ts
interface TournamentSource {
  listEvents(range: DateRange, cursor?: string): Promise<Page<EventSummary>>;
  getEvent(bcpId: string): Promise<EventDetail>;
  getPlayers(eventBcpId: string): Promise<Player[]>;
  getTeams(eventBcpId: string): Promise<Team[]>;
  getTeamMatchups(eventBcpId: string, round: number): Promise<TeamMatchup[]>;
  getGames(eventBcpId: string, round: number): Promise<Game[]>;
  getList(listBcpId: string): Promise<ArmyList | null>;
}
```

- **`BcpSource`** reads from the BCP web API. Settings: `BCP_API_URL` (default `https://newprod-api.bestcoastpairings.com`), `BCP_REFRESH_TOKEN` or `BCP_ACCESS_TOKEN`.
- **`FixtureSource`** serves anonymised JSON from `fixtures/bcp/`. It's used for development and for every automated test. Fixtures are built from real responses with player and team names replaced by fake ones.
- The source is chosen at startup with `TOURNAMENT_SOURCE=bcp|fixtures`.
- Each response is parsed with a Zod schema that describes only the fields we use (extra fields are allowed), then mapped to a domain type. If parsing fails, it throws `BcpSchemaError` with the field path and endpoint.
- **HTTP client:**
  - Rate limited: default 2 requests/second, at most 2 at a time.
  - Retries 429 and 5xx errors with exponential backoff and jitter, up to 4 attempts, and honours `Retry-After`.
  - 15-second timeout per request.
  - On a 401, refreshes the access token once and retries. If it still fails, raises `BcpAuthError`.
  - Sends an honest `User-Agent` naming the tool.

## 7. Sync jobs (`apps/api/src/sync/`)

| Kind       | What it does                                                                | Size                                                            |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `catalog`  | Pages through all 40k events in a date range and upserts them into `events` | about 1 request per 100 events (a year is roughly 100 requests) |
| `event`    | Event detail, players and teams                                             | 3 requests                                                      |
| `pairings` | Team matchups and games for every round                                     | 2 × rounds (+ paging)                                           |
| `lists`    | One request per player with a `listId` and no stored list                   | about 1 per player                                              |

- `POST /api/sync` with `{ kind, eventId?, from?, to? }` creates a `sync_runs` row and returns `{ syncRunId }` immediately. The work continues in an in-process runner.
- Each item is saved as soon as it's fetched. A retry only fetches what's still missing.
- Only one sync of a given kind can run for the same target at a time. A second request returns the id of the run already in progress.
- The web app polls `GET /api/sync-runs/:id` every 2 seconds while a sync is running.
- **Freshness:**
  - Ended events are cached until the user presses "Refresh".
  - Events still running are treated as stale after 10 minutes.
  - When the finder page opens and the last catalogue sync is older than 6 hours, it re-syncs the **last 30 days plus the next 7**. This keeps the default "Latest" view current.
- **Catalogue coverage:**
  - The date ranges already fetched from BCP are the union of the `from`–`to` ranges of succeeded `catalog` runs.
  - `GET /api/catalog/coverage` returns them merged, e.g. `[{ from, to, syncedAt }]`.
  - The finder uses this to spot gaps in a deep search's date range and offer to fetch them.
- **Future:** move to a persistent job queue (e.g. pg-boss on the same Postgres) only if we ever run more than one API process.

## 8. API routes (`apps/api/src/routes/`)

| Method & path                                                                     | Purpose                                                                                                    |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /api/events?from&to&country&minPlayers&maxPlayers&type&q&sort&page&pageSize` | Search the **local** catalogue. `sort` is `date` (newest first, the default) or `players` (biggest first). |
| `GET /api/catalog/coverage`                                                       | Merged date ranges already fetched from BCP (see §7)                                                       |
| `GET /api/events/:id`                                                             | Event detail with sync status for each kind                                                                |
| `GET /api/events/:id/players`                                                     | Players with faction, placing, record, and whether their list has been fetched                             |
| `GET /api/events/:id/lists/export?format=txt\|json`                               | Download all fetched lists                                                                                 |
| `GET /api/players/:id/list`                                                       | A single army list                                                                                         |
| `GET /api/events/:id/rounds`                                                      | Pairings and results for each round (team matchups with nested games)                                      |
| `GET /api/events/:id/standings`                                                   | Team standings with points per round                                                                       |
| `GET /api/events/:id/teams/:teamId`                                               | A team's players with per-round results                                                                    |
| `GET /api/events/:id/matchups?minGames`                                           | Faction matchup matrix for one event                                                                       |
| `GET /api/matchups?eventIds=…&minGames`                                           | Faction matchup matrix combined across the given events                                                    |
| `POST /api/sync`                                                                  | Start a sync (see §7)                                                                                      |
| `GET /api/sync-runs/:id`                                                          | Sync progress                                                                                              |

Every error response has the shape `{ error: { code, message, details? } }`.

## 9. Analysis (`apps/api/src/analysis/`)

Pure functions with no I/O, each with thorough unit tests:

- `computeStandings(teams, matchups)`: team placing and points per round.
- `computeTeamContribution(team, games)`: each player's game points, VP and win/loss/draw per round.
- `computeFactionMatrix(games, { minGames })`: for each ordered pair of factions, the number of games, wins, losses, draws, win rate (a draw counts as half a win) and average VP difference. Mirror matches are counted separately and are not included in the win rate. Cells below `minGames` are flagged `insufficient`.

## 10. Web app (`apps/web/src/`)

Routes use TanStack Router. All filters and tab choices are stored in the URL, so any view can be shared as a link.

- **`/`: Tournament finder: latest big tournaments by default, deep search on demand.**
  - **Size filter, always visible:**
    - Preset buttons All · 16+ · **40+ (default)** · 100+ · 200+.
    - "Custom" shows min/max player inputs (e.g. 50–120).
    - Player counts are players, not teams. When the team count is known (after an event sync), team events show both, e.g. "432 players · 108 teams".
  - **Default view "Latest":**
    - Events that started in the last 30 days or are running now, newest first, filtered by the size filter.
    - Kept current by the automatic catalogue refresh (§7).
  - **Advanced panel (deep search):** any date range, name search, country, singles/teams/all, sort by newest or biggest first.
  - **Coverage gaps:**
    - If the chosen date range includes days that aren't in the catalogue yet (per `GET /api/catalog/coverage`), a notice names the missing span and its approximate request count, with a **Fetch** button.
    - Fetch starts a `catalog` sync for exactly the gap. Results appear as pages arrive.
  - **Table:** name, date, location, players (and teams), type, sync status badges. Rows link to the event page.
  - Shows when the catalogue was last synced.
- **`/events/$eventId`: Event page.** The header shows name, dates, player count and a Refresh button. Tabs:
  - **Players & lists:**
    - Search and faction filter.
    - Clicking a row opens a drawer with the raw list and a copy button.
    - "Fetch all lists" with a progress bar, and export as `.txt`/`.json`.
  - **Rounds:** pairings and results for each round, with VP and who went first. Team events group games under their team matchup, and each matchup row expands to show its games.
  - _Team events only:_
    - **Standings:** teams by placing, with points per round in columns.
    - **Team detail** (`/events/$eventId/teams/$teamId`): each player's per-round results.
    - **Faction matchups:** heatmap with a min-games control. Clicking a cell lists the games behind it.
- **`/analysis/matchups`:** choose several synced team events and see the combined heatmap.
- **`/settings`:** BCP connection status (token valid or expired) and when the token was last refreshed. Shows no secrets.

**UI conventions**

- **Minimal sci-fi theme, dark only** (no light mode, no toggle). Sci-fi colours, but restrained; no kitsch.
  - A flat near-black navy page. No grid, no glow.
  - Content sits in flat `Panel` surfaces with a hairline border and a small muted monospace caption.
  - Neon cyan is the only accent in the interface chrome, used for active/focus states, primary actions and status. Plasma magenta is reserved for data, e.g. side B in matchups.
  - Fonts:
    - Orbitron only for the "BCP Analyzer" wordmark.
    - Exo 2 for headings (semibold, normal case) and body text.
    - JetBrains Mono with tabular numbers for figures and captions.
  - No text glow and no decorative animation.
  - Text keeps WCAG AA contrast.
- Mantine `AppShell`, with the Mantine theme defined in one file (`apps/web/src/theme.ts`).
- The heatmap is a custom component built on Mantine's `Table`. It uses a diverging scale (red → grey → green) and prints the numbers in each cell, so it doesn't rely on colour alone.
- Every data view has a loading skeleton, an empty state and an error state with a retry button.
- Code is grouped by feature under `src/features/<feature>/`: components, query hooks, utilities and tests together.

## 11. Error handling

- **API errors:**
  - BCP unreachable or failing (after retries): 502 `BCP_UNAVAILABLE`.
  - BCP rate limit: 503 `BCP_RATE_LIMITED` with `Retry-After`.
  - BCP response didn't match our schema: 502 `BCP_SCHEMA_MISMATCH` with the field path.
  - BCP session expired or invalid: 502 `BCP_AUTH` (shown in the UI with a link to `/settings`).
  - Not found: 404 `NOT_FOUND`.
  - Invalid query or params: 400 `VALIDATION_ERROR` with the Zod issues.
- **Web:**
  - TanStack Query retries up to 2 times, but not on 4xx or `BCP_AUTH`.
  - Each route has an error boundary with a retry button.
  - When a sync fails, a notification appears with the error.
- **Logging:** pino structured logs. Each BCP request is logged with its path, status, duration and attempt number. Tokens and the `Authorization` header are always redacted.

## 12. Testing

- **Unit** (Vitest): analysis functions and BCP mappers, run against the anonymised fixtures. This is the most heavily tested area.
- **API:** route tests use Hono's `app.request()` with `FixtureSource` and PGlite (a fresh schema per test file). There are no network calls anywhere in the test suite.
- **Components** (React Testing Library):
  - Finder filters update the URL.
  - The fetch-lists progress bar and its completion.
  - Expanding a team matchup shows its games.
- **E2E** (Playwright): one smoke test against fixtures. Find an event → open it → fetch lists → view the matchup heatmap.
- `pnpm check` runs typecheck, lint, tests and the Prettier formatting check. lint-staged runs ESLint and Prettier on the files in each commit.

## 13. Repository layout

```
bcp-scrapper/
├─ apps/
│  ├─ web/src/{routes,features,components,api,theme}
│  └─ api/src/{bcp,db,sync,analysis,routes}
├─ packages/shared/src/        # Zod schemas + types
├─ fixtures/bcp/               # anonymised BCP responses
├─ scripts/anonymise-fixtures.ts
├─ docs/superpowers/specs/
├─ docker-compose.yml          # Postgres 17
├─ eslint.config.js  .prettierrc  tsconfig.base.json
├─ .nvmrc (lts/krypton)  pnpm-workspace.yaml  .env.example
```

`.env` is git-ignored. `.env.example` lists every variable with no secrets.

## 14. Build order

1. Monorepo, tooling, lint/format/test setup, Docker Compose Postgres, and an empty app shell that runs. **Verify BCP token refresh.**
2. Shared schemas, Drizzle schema and migrations, BCP Zod schemas and mappers, anonymised fixtures, `FixtureSource` and `BcpSource`.
3. Feature 1: catalogue sync and finder, event page, players & lists, list sync, export.
4. Feature 2: pairings sync, rounds, standings, team detail, faction matrix (per event, then across events).
