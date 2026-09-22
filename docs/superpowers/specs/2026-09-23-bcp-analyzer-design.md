# BCP Analyzer — Design Spec

- **Date:** 2026-09-23
- **Status:** Approved design, pending spec review
- **Scope:** Warhammer 40k only

## 1. Goals

1. **Tournament finder & list fetching** — find large 40k tournaments on Best Coast Pairings (BCP) and, on demand, fetch and export every player's army list.
2. **Team event analysis** — for team events, show how pairings were made each round and what the results were: team standings, round-by-round matchups, per-player contribution, and faction-vs-faction matchup statistics (per event and aggregated across events).

### Non-goals (for now)

- Parsing army lists into units/points (lists are stored as raw text).
- Recording the pairing *process* (defender / attacker / refusal picks). BCP does not expose it; the data model leaves room for it later.
- Game systems other than Warhammer 40k.
- Authentication, public hosting, multi-instance deployment.

### Audience & deployment

A small team. It runs locally with `pnpm dev` for now, and is structured so it can later be containerised (Docker) and given simple auth without restructuring.

## 2. Known risks

- **BCP API access.** BCP does not publish a documented public API. Their web app uses an internal JSON API. The user intends to obtain official/paid access. All BCP-specific code is isolated behind one interface (`TournamentSource`) so the endpoint, auth and response formats can change without touching the rest of the app.
- **Pairing-process data** is not available from BCP (see Non-goals).
- **Node version.** The toolchain requires Node ≥ 20.19. The project pins the current LTS, **Node 24 LTS (Krypton)** via `.nvmrc`.

## 3. Architecture

pnpm monorepo:

```
React (apps/web) ──HTTP/JSON──▶ Hono API (apps/api) ──▶ TournamentSource ──▶ BCP
                                      │
                                      └──▶ SQLite (Drizzle ORM)
```

- The browser talks only to our API, never to BCP directly. This avoids cross-origin (CORS) problems and keeps the BCP token on the server.
- The API serves data from SQLite and calls BCP only when the user explicitly fetches or refreshes.
- `packages/shared` holds Zod schemas and the TypeScript types derived from them. Both apps import from it, so the web app and the API cannot disagree about data shapes.

### Tech stack

| Area | Choice |
|---|---|
| Language | TypeScript (strict, `noUncheckedIndexedAccess`, no `any`) |
| Runtime | Node 24 LTS (Krypton), pnpm workspaces |
| Web | React 19 + React Compiler 1.0, Vite |
| Routing | TanStack Router (file-based, type-safe search params) |
| Server state | TanStack Query |
| UI | Mantine (core, dates, notifications, charts), `mantine-datatable`, CSS Modules + `postcss-preset-mantine` |
| API | Hono on Node (`@hono/node-server`) |
| DB | SQLite (`better-sqlite3`) + Drizzle ORM & drizzle-kit migrations |
| Validation | Zod |
| Logging | pino |
| Lint | ESLint flat config, `typescript-eslint` strict type-checked, `eslint-plugin-react-hooks` (includes the React Compiler rules) |
| Format | Prettier |
| Tests | Vitest, React Testing Library, Playwright (single smoke test) |
| Git hooks | Husky + lint-staged |

**`mantine-datatable` fallback:** if it doesn't support the current Mantine major version, use TanStack Table rendered with Mantine's `Table`.

## 4. Data model (SQLite)

| Table | Columns (key) |
|---|---|
| `events` | `id`, `bcp_id` (unique), `name`, `start_date`, `end_date`, `country`, `city`, `player_count`, `is_team_event`, `team_size`, `round_count`, `status` (upcoming/in_progress/finished), `last_synced_at` |
| `teams` | `id`, `event_id`, `bcp_id`, `name`, `final_placing`, `total_points` |
| `players` | `id`, `event_id`, `team_id` (nullable), `bcp_id`, `name`, `faction`, `detachment`, `placing`, `wins`, `losses`, `draws` |
| `army_lists` | `id`, `player_id` (unique), `faction`, `detachment`, `raw_text`, `fetched_at` |
| `team_matchups` | `id`, `event_id`, `round`, `team_a_id`, `team_b_id`, `points_a`, `points_b` |
| `games` | `id`, `event_id`, `round`, `team_matchup_id` (nullable), `table_no`, `player_a_id`, `player_b_id`, `score_a`, `score_b`, `result` (a_win/b_win/draw) |
| `sync_runs` | `id`, `event_id`, `kind` (event/lists/pairings), `status` (queued/running/succeeded/failed), `total`, `done`, `failed`, `error`, `started_at`, `finished_at` |

- Singles and team events share `games`, so faction matchup statistics can draw on both.
- `team_matchups.points_*` stores the team score as BCP reports it. If BCP doesn't report it, it's derived from the individual games using the event's team scoring rule.
- A future `pairing_picks` table (round, team, role, player) can be added without changing existing tables.

## 5. BCP adapter (`apps/api/src/bcp/`)

```ts
interface TournamentSource {
  searchEvents(filter: EventSearch): Promise<EventSummary[]>;
  getEvent(bcpId: string): Promise<EventDetail>;
  getPlayers(bcpId: string): Promise<Player[]>;
  getList(playerBcpId: string): Promise<ArmyList | null>;
  getRounds(bcpId: string): Promise<RoundPairings[]>;
}
```

- **`BcpSource`**: the real implementation. It reads `BCP_API_URL` and `BCP_API_KEY` from the environment.
- **`FixtureSource`**: serves saved JSON from `fixtures/bcp/`. It's used for development without API access and for every automated test.
- The source is chosen at startup with `TOURNAMENT_SOURCE=bcp|fixtures`.
- Every BCP response is parsed with a Zod schema, then mapped to a domain type. If parsing fails, it throws `BcpSchemaError`, which includes the field path and the event id.
- **HTTP client**: rate limited (default 2 requests/second, at most 3 concurrent). It retries 429/5xx errors with exponential backoff and jitter, up to 4 attempts, honours `Retry-After`, and times out each request after 15 seconds. All of these values can be configured through environment variables.

## 6. Sync jobs (`apps/api/src/sync/`)

- `POST /api/events/:id/sync?kind=lists|pairings|event` creates a `sync_runs` row and returns `{ syncRunId }` immediately. The work continues in an in-process runner.
- Items are saved as soon as each one is fetched. A retry only fetches items that are still missing.
- Only one sync of a given kind can run per event at a time. A second request gets back the id of the run already in progress.
- The web app polls `GET /api/sync-runs/:id` every 2 seconds while a sync is running.
- **Freshness**: finished events are cached until the user presses "Refresh". Events in progress are treated as stale after 10 minutes.
- **Future:** move to a persistent job queue only if the API ever runs as more than one process.

## 7. API routes (`apps/api/src/routes/`)

| Method & path | Purpose |
|---|---|
| `GET /api/events/search?from&to&country&minPlayers&type` | Search BCP. Results are merged with sync status from the local DB. |
| `GET /api/events/:id` | Event detail (from cache; fetched on first access) |
| `GET /api/events/:id/players` | Players with faction, placing, record, and whether their list has been fetched |
| `GET /api/events/:id/lists/export?format=txt\|json` | Download all fetched lists |
| `GET /api/players/:id/list` | A single army list |
| `GET /api/events/:id/rounds` | Pairings and results for each round (team matchups with nested games) |
| `GET /api/events/:id/standings` | Team standings with points per round |
| `GET /api/events/:id/teams/:teamId` | A team's players with per-round results |
| `GET /api/events/:id/matchups?minGames` | Faction matchup matrix for one event |
| `GET /api/matchups?eventIds=…&minGames` | Faction matchup matrix combined across the given events |
| `POST /api/events/:id/sync?kind=…` | Start a sync |
| `GET /api/sync-runs/:id` | Sync progress |

Every error response has the shape `{ error: { code, message, details? } }`.

## 8. Analysis (`apps/api/src/analysis/`)

Pure functions with no I/O, each with thorough unit tests:

- `computeStandings(teams, matchups)`: team placing and points per round.
- `computeTeamContribution(team, games)`: each player's points and win/loss/draw per round.
- `computeFactionMatrix(games, { minGames })`: for each ordered pair of factions, the number of games, wins, losses, draws, win rate (a draw counts as half a win) and average score difference. Mirror matches are counted separately and are not included in the win rate. Cells below `minGames` are flagged `insufficient`.

## 9. Web app (`apps/web/src/`)

Routes use TanStack Router. All filters and tab choices are stored in the URL, so any view can be shared as a link.

- **`/`: Tournament finder.** Filters: date range, country, minimum players (default 40), type (singles/teams/all). The sortable table has name, date, location, players, type and a sync status badge.
- **`/events/$eventId`: Event page.** The header shows name, dates, player count and a Refresh button. Tabs:
  - **Players & lists**: search and faction filter. Clicking a row opens a drawer with the raw list and a copy button. It also has "Fetch all lists" with a progress bar, and export as `.txt`/`.json`.
  - **Rounds**: pairings and results for each round. Team events group games under their team matchup, and each matchup row expands to show its games.
  - *Team events only:*
    - **Standings**: teams by placing, with points per round in columns.
    - **Team detail** (`/events/$eventId/teams/$teamId`): each player's per-round results.
    - **Faction matchups**: heatmap with a min-games control. Clicking a cell lists the games behind it.
- **`/analysis/matchups`**: choose several cached team events and see the combined heatmap.

**UI conventions**
- Mantine `AppShell`, light and dark mode, and the Mantine theme defined in one file.
- The heatmap is a custom component built on Mantine's `Table`. It uses a diverging scale (red → grey → green) and prints the numbers in each cell, so it doesn't rely on colour alone.
- Every data view has a loading skeleton, an empty state and an error state with a retry button.
- Code is grouped by feature under `src/features/<feature>/`: components, query hooks, utilities and tests together.

## 10. Error handling

- **API errors:**
  - BCP unreachable or failing (after retries): 502 `BCP_UNAVAILABLE`.
  - BCP rate limit: 503 `BCP_RATE_LIMITED` with `Retry-After`.
  - BCP response didn't match our schema: 502 `BCP_SCHEMA_MISMATCH` with the field path.
  - Not found: 404 `NOT_FOUND`.
  - Invalid query or params: 400 `VALIDATION_ERROR` with the Zod issues.
- **Web:**
  - TanStack Query retries up to 2 times, but not on 4xx.
  - Each route has an error boundary with a retry button.
  - When a sync fails, a notification appears with the error and a link to the event.
- **Logging:** pino structured logs. Each BCP request is logged with its URL path, status, duration and attempt number. The token is never logged.

## 11. Testing

- **Unit** (Vitest): analysis functions and BCP mappers, run against fixture JSON. This is the most heavily tested area.
- **API**: route tests use Hono's `app.request()` with `FixtureSource` and an in-memory SQLite database. There are no network calls anywhere in the test suite.
- **Components** (React Testing Library):
  - Finder filters update the URL.
  - The fetch-lists progress bar and its completion.
  - Expanding a team matchup shows its games.
- **E2E** (Playwright): one smoke test against fixtures. Find an event → open it → fetch lists → view the matchup heatmap.
- `pnpm check` runs typecheck, lint, tests and the Prettier formatting check. lint-staged runs ESLint and Prettier on the files in each commit.

## 12. Repository layout

```
bcp-scrapper/
├─ apps/
│  ├─ web/src/{routes,features,components,api,theme}
│  └─ api/src/{bcp,db,sync,analysis,routes}
├─ packages/shared/src/        # Zod schemas + types
├─ fixtures/bcp/               # saved BCP responses
├─ docs/superpowers/specs/
├─ eslint.config.js  .prettierrc  tsconfig.base.json
├─ .nvmrc (lts/krypton)  pnpm-workspace.yaml  .env.example
```

## 13. Build order

1. Monorepo, tooling, lint/format/test setup, and an empty app shell that runs.
2. Shared schemas, DB schema and migrations, `FixtureSource` with hand-written fixtures.
3. Feature 1: search, event page, players & lists, sync jobs, export.
4. Feature 2: rounds, standings, team detail, faction matrix (per event, then across events).
5. `BcpSource` against the real API once access is available. Record real responses as fixtures.
