# Team Analysis: Design Spec (plans 4 and 5)

- **Date:** 2026-09-24
- **Status:** Approved design, pending spec review
- **Builds on:** `2026-09-23-bcp-analyzer-design.md` (the main spec) and `2026-09-24-list-queue-design.md` (plan 3). Where this spec differs from the main spec's team-analysis sections, this spec wins.
- **Delivery:**
  - **Plan 4:** data and event views (§3, §4, §5.1–5.4, §6 except the matrix, §7.1–7.3).
  - **Plan 5:** the faction matchup matrix and the cross-event page (§5.5–5.6, §7.4–7.5).

## 1. Goals

1. **Review one event in depth:** rounds, standings, each team's players and results.
2. **Scout the meta:** faction-vs-faction results in team play, for one event and combined across events.
3. **Players grouped by team** on team events.
4. **Fetch pairings gently.** Pairings for one event or for many go through the same paced background queue as army lists (plan 3), so a meta view never floods BCP.

### Non-goals

- Pairing-process data (defender, attacker, refusals). BCP doesn't expose it.
- Automatic crawling. Nothing is fetched without the user asking.
- Per-game victory points for bracket-format events (see §2). They would cost one request per game.

## 2. Spike findings (2026-09-24, The Summer I.T.T., `8G5SizDp632n`)

- `GET /v1/pairings?eventId&round&pairingType=Pairing` (our current endpoint) returns **no games** for bracket/GW-format team events.
- `GET /v1/events/{id}/pairings?round=N&pairingType=Pairing` returns `{active, deleted}` with **every individual game** of the round: 180 games in round 1. Each game has:
  - `player1`/`player2` with `faction`, `parentFaction`, `subFaction` and `listId`;
  - `table`;
  - `teamPairingId`, linking it to its team matchup (all 36 of the round's matchups linked);
  - `player1Game`/`player2Game`, each with `{ id, result, points }`, where result 0 = loss, 1 = draw, 2 = win, and points are game points.
- Those games have **no `metaData`**: no VP, primary, secondary or first turn. `GET /v1/games/{gameId}` has VP details, but only one game per request.
- Byes appear as a game with no `player2`.
- Bracket (pod) rounds are only partly exposed. Round 6 had one team matchup (5 games). Other pod games appear only in each player's `total_games`, with no opponent, and are ignored.
- `/v1/pairings` without `pairingType`, or with `teamPairingId`, answers HTTP 409.

## 3. Pairings sync

- For each round, fetch the team matchups (as today), then the games from `/v1/pairings` (as today).
- If that returns **no games** while the round has team matchups, fetch `/v1/events/{id}/pairings?round=N&pairingType=Pairing` and map its games instead:
  - VP, primary, secondary and first turn are `null`;
  - a game with no `player2` is a bye and is stored with `player_b_id = null` and result `a_win`.
- **Replace semantics stay as today:** a non-empty result for a round replaces that round's stored games and matchups, and an empty result leaves stored rows untouched.
- A round with team matchups but no games from either endpoint is stored with its matchups only. The views say "individual games unavailable" for it.

## 4. The fetch queue

Plan 3's `list_queue` becomes **`fetch_queue`**. It is renamed by a migration, and existing rows are kept as kind `list`.

| Column                                                                                                            | Change                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `kind`                                                                                                            | New enum `list` · `event` · `pairings-round`, not null, default `list` for existing rows |
| `player_id`, `list_id`                                                                                            | Now nullable. Required for `list`                                                        |
| `round`                                                                                                           | New nullable integer. Required for `pairings-round`                                      |
| All other columns (`event_id`, `priority`, `status`, `attempts`, `not_before`, `error`, `error_code`, timestamps) | Unchanged                                                                                |

- **Uniqueness:** at most one open (queued or fetching) job per target. For `list` that is `player_id`; for `event`, `event_id`; for `pairings-round`, `(event_id, round)`. These are partial unique indexes, one per kind.
- **Worker** (same loop, same pace: one job per tick, `LIST_QUEUE_INTERVAL_MS` renamed to **`FETCH_QUEUE_INTERVAL_MS`**, default 5000; the old name is still read as a fallback):
  - `list`: as plan 3.
  - `event`: syncs the event detail, teams and players (the existing `syncEvent`).
  - `pairings-round`: syncs one round's team matchups and games (§3). Before running, it checks that the event has been synced. If not, it re-queues itself 1 minute later, behind the `event` job that is queued with it. When an event's last open round job finishes and all its rounds succeeded, it sets `events.pairings_synced_at`.
  - Errors, backoff, pause on a rejected login, per-row auth errors and `NO_LIST` (lists only) behave as in plan 3.
- **Queueing pairings** for an event queues:
  - an `event` job, if the event was never synced;
  - one `pairings-round` job for each round from 1 to `round_count`, skipping rounds with an open job.

  Priority is 10 when requested from the event page and 0 from the cross-event page. Re-queueing an event whose pairings are already synced is allowed; it refreshes them.

- **The `pairings` sync kind is retired:** `POST /api/sync` with it returns 400. `SyncKindSchema` keeps it so old history rows still parse.
- **Estimates** use the same formula as plan 3: jobs ahead × interval.

## 5. Analysis

The calculations are pure functions in `@bcp/shared` (`analysis/*.ts`). The API loads rows and calls them.

1. **Standings** (`computeStandings`):
   - Teams are ordered by BCP `placing` when present, otherwise by total team points, then by name.
   - Each team row shows its points and result (W/L/D against the opposing team) for each round, plus totals.
   - A round is flagged `bracket: true` (labelled "Bracket") when its team matchups involve fewer than half of the teams that played round 1. For example, The Summer I.T.T.'s round 6 has 1 matchup against 36 in round 1.
2. **Rounds:** for each round, its team matchups ordered by table: teams, team points and result. Each matchup has its games: table, players, factions, result, game points, and VP and first turn when known. Singles events list their games directly.
3. **Team detail** (`computeTeamContribution`):
   - The team's players, ordered by total game points (descending).
   - Each player's faction, with a line per round: opponent, opposing faction, result, game points and VP (when known).
   - Each player's totals: W/L/D and game points. Team totals.
4. **Players grouped by team** (web only): the existing players data grouped by `teamName`, with groups ordered by team placing.
5. **Faction matchup matrix** (`computeFactionMatrix`, plan 5):
   - Factions are `players.faction` (e.g. "Adepta Sororitas"). Players with no faction are left out.
   - Each game counts once for each side: row = that side's faction, column = the opponent's faction.
   - **Win rate** = (wins + ½ draws) / games, shown with the game count.
   - **Average game points** = the mean of the row side's game points.
   - **Mirror matches** (same faction on both sides) are counted on the diagonal but show no win rate.
   - `minGames` (default 3) hides cells with fewer games. Byes and games with an unknown result are left out.
   - **Scoring scale:** each game has a scale of `points_a + points_b`. An event's scale is the most common game scale. The game-points toggle is enabled only when every included event has the same scale; otherwise it is disabled and says "Events use different scoring".
   - **Drill-down:** a cell lists its games (event, round, table, players, factions, result, game points).
6. **Cross-event** (`/analysis/matchups`, plan 5):
   - A date range, defaulting to the last 90 days.
   - The team events in the catalogue in that range, each with its pairings state: synced (`pairings_synced_at` set), partial (some round jobs done or failed), missing, or fetching (open jobs).
   - A tick box per event. Synced events are ticked by default; partial and missing ones are not.
   - **"Sync pairings for N events"** queues pairings for every missing or partial event in the range at priority 0.
   - The matrix combines the ticked events. The range and exclusions live in the URL.

## 6. API

All state changes need a JSON body and pass the Host guard.

| Route                                                              | Purpose                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/events/:id/pairings/queue`                              | Queues the event's pairings at priority 10 (§4). Returns `{ queuedRounds, eventQueued, estimatedSeconds }`.                                |
| `POST /api/pairings-queue`                                         | Body `{ eventIds: string[] }` (1–200). Queues each at priority 0. Returns `{ events, queuedRounds, estimatedSeconds }`. (Plan 5.)          |
| `GET /api/events/:id/rounds`                                       | `{ rounds: [{ round, bracket, matchups: [{ …, games: [...] }], games: [...] }] }`. Team events use `matchups`; singles events use `games`. |
| `GET /api/events/:id/standings`                                    | `{ rounds: number[], teams: [{ team, placing, perRound: [{ round, points, result, opponent }], totals }] }`                                |
| `GET /api/events/:id/teams/:teamId`                                | `{ team, players: [{ player, perRound: [...], totals }], totals }`                                                                         |
| `GET /api/events/:id/matchups?minGames`                            | The matrix for one event (plan 5).                                                                                                         |
| `GET /api/matchups?from&to&exclude&minGames`                       | The combined matrix, plus the list of events used and each one's pairings state (plan 5).                                                  |
| `GET /api/fetch-queue`, `POST …/pause`, `/resume`, `/retry-failed` | Renamed from `/api/list-queue/*`. The old paths are removed. The state gains `totals` by kind.                                             |

- `EventDetail` gains `pairings: { syncedAt, roundsDone, roundCount, queued, failed, gamesAvailable }`, where `gamesAvailable` is false when stored team matchups have no games.
- `EventSyncs` drops `pairings`, as it dropped `lists`.

## 7. Web

1. **Event tabs:**
   - Team events: **Players & lists**, **Rounds**, **Standings**, **Matchups** (plan 5).
   - Singles events: **Players & lists**, **Rounds**, **Matchups** (plan 5).
   - Tabs live in the URL, as today.
   - **Without pairings:** the analysis tabs show an empty state with **Fetch pairings** (queues at priority 10) and the estimate.
   - **While fetching:** "Pairings · 3/6 rounds · about 20 s", and the tab refetches every 5 s until done.
   - **Failed rounds:** "Round 4 failed · Retry".
   - **No individual games:** "Individual games unavailable for this event" above the rounds and standings, which still work.
2. **Rounds tab:**
   - A round picker (segmented control) and the round's matchups table.
   - Each row expands to its games: players, factions, result, game points, and VP and first turn when known, with "–" otherwise.
   - Team names link to team detail.
3. **Standings tab** and **team detail page** (`/events/$eventId/teams/$teamId`):
   - Standings are a table of teams with a column per round (points and result) and totals. Bracket rounds are labelled.
   - Team detail shows the team header (placing, totals) and a player table with per-round cells.
   - Both scroll horizontally on phones.
4. **Players & lists, grouped:** on team events, a **Group by team** switch, on by default, stored in the URL.
   - Groups are collapsible sections with the team name, placing and player count, ordered by placing.
   - Search, faction and record filters apply inside the groups; empty groups are hidden.
   - List badges, the drawer and Fetch lists work as today.
5. **Matchups tab and `/analysis/matchups`** (plan 5):
   - A heatmap table: rows and columns are factions, and cells show the value as text plus the game count.
   - Colours: cyan above 50% (or above the midpoint of the scale), magenta below, neutral near the middle. Mirror cells are hatched.
   - Controls: **Win rate | Game points** (disabled with a reason when scales differ) and **Min games**.
   - Clicking a cell opens a drawer with its games.
   - The cross-event page shows the event list and tick boxes above the matrix. Its **Sync pairings for N events** button shows the queue estimate.
6. **Header and Settings:** the indicator reads "Fetching · N jobs · ~T" and covers lists and pairings. Its popover shows totals by kind. The Settings card is renamed **Fetch queue**.
7. **Theme and accessibility:**
   - Same minimal dark theme: cyan for the interface chrome, magenta only in data.
   - Every figure uses `numeric`, and every coloured cell also carries its value as text.
   - Expanders and cells are keyboard reachable, and progress text is `aria-live="polite"`.

## 8. Testing

- **Fixtures:**
  - A second anonymised sample team event, `EVTBRACKET01`: 2 swiss rounds and 1 bracket round. Its games come only from the event-level endpoint (the individual-pairings endpoint returns `{data: []}`). It includes a bye and a draw.
  - The existing `EVTTEAM0001` keeps the individual-pairings path.
- **Shared:**
  - `computeStandings`: placing vs points order, and bracket flags.
  - `computeTeamContribution`.
  - `computeFactionMatrix`: win rate with draws, mirrors, `minGames`, byes excluded, scale detection and a mixed-scale refusal.
- **API:**
  - The pairings fallback: VP stays null and byes are mapped.
  - The migration keeps existing queue rows.
  - Worker `event` and `pairings-round` jobs, including the wait-for-event re-queue and `pairings_synced_at`.
  - Routes, including the 400 for the retired `pairings` sync kind.
- **Web:**
  - Tab empty, fetching and failed states.
  - Rounds expand.
  - Standings and team detail render.
  - Group by team with filters.
  - The heatmap toggle is disabled on mixed scales (plan 5).
  - Cross-event ticks and the sync button (plan 5).
- **E2E:**
  - Plan 4: open the sample team event → Fetch pairings → Standings shows the teams → open a team.
  - Plan 5: Matchups tab → click a cell → see its games.

## 9. Build order

**Plan 4:**

1. Fixtures and the pairings fallback.
2. `fetch_queue` migration, worker kinds, the renamed routes and config, and the retired `pairings` kind.
3. Shared analysis: standings and contribution.
4. API: rounds, standings, team detail, and event pairings state.
5. Web: tabs with empty and fetching states, rounds, standings and team detail.
6. Web: players grouped by team; header and Settings renames; e2e and README.

**Plan 5:**

1. Shared: faction matrix.
2. API: event and combined matchups, bulk pairings queueing.
3. Web: Matchups tab with heatmap, toggle and drill-down.
4. Web: `/analysis/matchups` with event selection and bulk sync; e2e and README.
