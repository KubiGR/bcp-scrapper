# Team Analysis, Part 1 Implementation Plan (plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Team events get Rounds and Standings tabs, a team detail page and players grouped by team. The data comes from pairings fetched through one generalised background fetch queue, including bracket-format events whose games only the event-level endpoint serves.

**Architecture:**

- Plan 3's `list_queue` is renamed `fetch_queue` (task 2) and gains job kinds (task 3): `list`, `event` and `pairings-round`. One worker still claims one job every 5 s.
- The pairings sync falls back to `/v1/events/{id}/pairings?pairingType=Pairing` when `/v1/pairings` has no games (task 1).
- The analysis functions are pure and live in `@bcp/shared` (task 4). The API loads rows and calls them (task 5). The web app renders them (tasks 6–7).

**Tech Stack:** as plans 1–3 (Hono, Drizzle with Postgres or PGlite, Zod 4, React 19 with React Compiler, Mantine 9.6.2, mantine-datatable, TanStack Router and Query, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-24-team-analysis-design.md` (plan 4 = its §9 steps 1–6). Read it together with the main spec `2026-09-23-bcp-analyzer-design.md` and the plan 3 spec `2026-09-24-list-queue-design.md`.

**Deliberate refinements of the spec (apply when reading it):**

- **No waiting round jobs.** Spec §4 has `pairings-round` jobs re-queue themselves until the event is synced. Instead, an `event` job carries `follow_up = 'pairings'`, and when it finishes it queues the event's round jobs at its own priority. The round count is only known after an event sync, so round jobs are never created before it.
- **Bracket rounds.** Spec §5.1 says a round is a bracket round when its matchups involve "fewer than half" of round 1's teams. The rule here is **at most half, and never round 1**. The 5-team fixture's final (2 teams) then counts as bracket, and The Summer I.T.T.'s round 6 still qualifies.
- **Byes count as wins.** A team or player bye shows as "Bye" and counts as a win in totals, matching BCP's own records.
- **One queue estimate per event.** `EventDetail.listQueueSeconds` is renamed `queueSeconds`. It covers every job of the event (lists and pairings), and both the lists line and the pairings line use it.
- **Grouping needs team fields.** `EventPlayer` gains `teamId` and `teamPlacing`, so the players tab can group and order by team without a second request.

## Global Constraints

Plans 1–3's Global Constraints still hold:

- Node 24, pnpm 12, TypeScript `~6.0.3`, Zod 4 APIs.
- Strict type-checked ESLint with `--max-warnings=0`; no `any`.
- Tests sit next to the code; no network and no real Postgres in tests.
- Mantine pinned to 9.6.2; dark-only minimal theme (`Panel`, cyan-only chrome accent named `neon`, the `numeric` class on figures only, never on whole sentences); no manual memoisation.
- Every API read is validated by shared schemas. Every data view has loading, empty and error states.
- State-changing routes use `requireJson` (DELETE excepted). The Host guard stays.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read, print or source `.env`. No BCP requests in tests.
- Run commands in the foreground. Use `pnpm vitest run …`, never bare `vitest`.

In addition:

- **Queue pace:** one job per tick, `FETCH_QUEUE_INTERVAL_MS` (default 5000, minimum 100, falling back to `LIST_QUEUE_INTERVAL_MS`). No route fetches from BCP in bulk; bulk work goes through the queue.
- **Missing VP shows as "–"**, never 0.
- **Migrations:** migrations `0000`–`0002` are untouched. Task 2 adds a hand-written rename migration and task 3 a generated one. After each task, `pnpm --filter @bcp/api db:generate` must report no schema changes.

## Review Focus

1. **A bracket event where `/v1/pairings` returns no games.** The sync must use the event-level endpoint, store the games with null VP, store byes with no opponent, and the views must show "–" for VP. _Task 1 (source and sync test); task 6 (rounds panel test)._
2. **Queueing pairings twice, or while its jobs run.** There must be no duplicate jobs. A request from the event page raises the event's queued jobs to priority 10. _Task 3 (repository test)._
3. **An event never synced before (round count unknown).** Only an `event` job is queued. When it finishes it queues exactly `round_count` round jobs, and `pairings_synced_at` is set after the last one. _Task 3 (worker test)._
4. **Byes and teams missing from a round.** A team bye shows "Bye" with its points and counts as a win. A team with no matchup in a round shows "—". Rounds and standings still render when an event has matchups but no games. _Task 4 (standings test); task 5 (route test)._
5. **Queued list rows survive the rename.** The migration renames rather than recreates. Existing `list_queue` rows become `fetch_queue` rows of kind `list` and are still drained. _Task 2 (migration SQL test); task 3 (default kind)._

## File Map

```
fixtures/bcp/sample/events/EVTBRACKET01/  (new) bracket-format team event fixture (5 teams, 3 rounds)
apps/api/src/bcp/fixture-transport.ts     event-level games → event-games.round-N.json
apps/api/src/bcp/raw.ts, mappers.ts       RawEventGame, mapEventGame
apps/api/src/bcp/source.ts                TournamentSource.getEventGames
apps/api/src/sync/round-pairings.ts       (new) syncRoundPairings: one round, with the fallback
apps/api/src/sync/jobs.ts                 syncEvent exported; syncPairings job removed (task 3)
apps/api/src/db/schema.ts                 fetchQueue (renamed), kinds, events.pairings_synced_at
apps/api/drizzle/0003_fetch-queue.sql     (new, hand-written) rename list_queue → fetch_queue
apps/api/drizzle/0004_*.sql               (new, generated) job kinds
apps/api/src/fetch-queue/                 (renamed from list-queue/) worker, queue-lists, queue-pairings
apps/api/src/repo/fetch-queue.ts          (renamed from repo/list-queue.ts) + kinds
apps/api/src/repo/analysis.ts             (new) loads an event's teams, players, matchups, games
apps/api/src/routes/fetch-queue.ts        (renamed from routes/list-queue.ts) + pairings queue route
apps/api/src/routes/analysis.ts           (new) rounds, standings, team detail
packages/shared/src/analysis/             (new) inputs, schemas, rounds, standings, contribution
packages/shared/src/api.ts                FetchQueue* (renamed), EventDetail.pairings, queueSeconds, EventPlayer.teamId/teamPlacing
packages/shared/src/sync.ts               SyncRequest − pairings
apps/web/src/features/fetch-queue/        (renamed from list-queue/)
apps/web/src/features/analysis/           (new) PairingsGate, RoundsPanel, StandingsPanel, TeamPage, queries
apps/web/src/features/event/              EventPage tabs, PlayersPanel grouping, players-filter
apps/web/src/routes/events.$eventId_.teams.$teamId.tsx  (new) team detail route
e2e/team-analysis.spec.ts                 (new)
```

---

### Task 1: Bracket-event fixture and the pairings fallback

**Files:**

- Create: `fixtures/bcp/sample/events/EVTBRACKET01/` with `event.json`, `teams.json`, `players.json`, `team-pairings.round-{1,2,3}.json`, `pairings.round-{1,2,3}.first.json` and `event-games.round-{1,2,3}.json`
- Create: `apps/api/src/sync/round-pairings.ts`, `apps/api/src/sync/round-pairings.test.ts`
- Modify: `apps/api/src/bcp/fixture-transport.ts` (+ test), `apps/api/src/bcp/raw.ts`, `apps/api/src/bcp/mappers.ts` (+ test), `apps/api/src/bcp/source.ts` (+ test), `apps/api/src/sync/jobs.ts`, `apps/api/src/sync/runner.test.ts`
- Modify every hand-written `TournamentSource` implementation in tests (search `: TournamentSource = {` and `implements TournamentSource`) to add `getEventGames`

**Interfaces:**

- Consumes: `replaceRoundPairings(db, eventId, round, { teamMatchups, games })` (`repo/pairings.ts`), `toGameResult` (`bcp/mappers.ts`), `RawListEnvelope`, `parseBcp`, `parseItems` (`bcp/raw.ts`).
- Produces:
  - `TournamentSource.getEventGames(eventId: string, round: number): Promise<Fetched<Game>[]>`
  - `mapEventGame(raw: RawEventGame, eventId: string): Game | null`
  - `syncRoundPairings(deps: { db: Db; source: TournamentSource; logger: Logger }, event: { id: string; isTeamEvent: boolean }, round: number): Promise<RoundPairingsOutcome>`, where `RoundPairingsOutcome = { matchups: number; games: number; gamesFrom: 'pairings' | 'event' | 'none' }`
  - `syncEvent` is exported from `sync/jobs.ts` (task 3's worker uses it)
  - The fixture event `EVTBRACKET01`: 5 teams, 10 players, 3 rounds, with round 3 a bracket final. Its individual games come only from the event-level endpoint.

- [ ] **Step 1: Add the fixture event**

All names are made up. Create `fixtures/bcp/sample/events/EVTBRACKET01/event.json`:

```json
{
  "id": "EVTBRACKET01",
  "name": "Sample Bracket Teams",
  "dates": { "start": "2026-05-09T09:00:00.000Z", "end": "2026-05-10T18:00:00.000Z" },
  "location": { "city": "Shelbyville", "country": "United States" },
  "format": { "teamEvent": true, "pairingStyle": "swiss", "bracketPairings": true },
  "status": { "started": true, "ended": true, "currentRound": 3, "numberOfRounds": 3 },
  "playerCounts": { "total": 10 },
  "teamPlayerCounts": { "total": 5 },
  "flags": { "hideLists": false },
  "isOnlineEvent": false
}
```

`teams.json`:

```json
{
  "active": [
    {
      "id": "TB-RED",
      "name": "Red Legion",
      "placing": 1,
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 30 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 25 },
        { "gameNum": 1, "pod": true, "gameResult": 2, "gamePoints": 21 }
      ]
    },
    {
      "id": "TB-BLUE",
      "name": "Blue Wardens",
      "placing": 2,
      "total_games": [
        { "gameNum": 1, "gameResult": 0, "gamePoints": 10 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 22 },
        { "gameNum": 1, "pod": true, "gameResult": 0, "gamePoints": 19 }
      ]
    },
    {
      "id": "TB-GREY",
      "name": "Grey Watch",
      "placing": 3,
      "total_games": [
        { "gameNum": 1, "gameResult": 1, "gamePoints": 20 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 40 }
      ]
    },
    {
      "id": "TB-JADE",
      "name": "Jade Court",
      "placing": 4,
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 40 },
        { "gameNum": 2, "gameResult": 0, "gamePoints": 15 }
      ]
    },
    {
      "id": "TB-GOLD",
      "name": "Gold Hosts",
      "placing": 5,
      "total_games": [
        { "gameNum": 1, "gameResult": 1, "gamePoints": 20 },
        { "gameNum": 2, "gameResult": 0, "gamePoints": 18 }
      ]
    }
  ],
  "deleted": []
}
```

`players.json`. `listId` is null throughout, so this event has no lists.

```json
{
  "active": [
    {
      "id": "PB-R1",
      "user": { "firstName": "Rhea", "lastName": "Stone" },
      "teamPlayerId": "TB-RED",
      "faction": { "name": "Adepta Sororitas", "parentFaction": { "name": "Imperium" } },
      "placing": 1,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 20 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 15 },
        { "gameNum": 1, "pod": true, "gameResult": 2, "gamePoints": 11 }
      ]
    },
    {
      "id": "PB-R2",
      "user": { "firstName": "Rolf", "lastName": "Hart" },
      "teamPlayerId": "TB-RED",
      "faction": { "name": "Space Marines", "parentFaction": { "name": "Imperium" } },
      "placing": 6,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 1, "gamePoints": 10 },
        { "gameNum": 2, "gameResult": 1, "gamePoints": 10 },
        { "gameNum": 1, "pod": true, "gameResult": 1, "gamePoints": 10 }
      ]
    },
    {
      "id": "PB-B1",
      "user": { "firstName": "Bea", "lastName": "Moss" },
      "teamPlayerId": "TB-BLUE",
      "faction": { "name": "Necrons", "parentFaction": { "name": "Xenos" } },
      "placing": 5,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 0, "gamePoints": 0 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 12 },
        { "gameNum": 1, "pod": true, "gameResult": 1, "gamePoints": 10 }
      ]
    },
    {
      "id": "PB-B2",
      "user": { "firstName": "Bram", "lastName": "Holt" },
      "teamPlayerId": "TB-BLUE",
      "faction": { "name": "Aeldari", "parentFaction": { "name": "Xenos" } },
      "placing": 8,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 1, "gamePoints": 10 },
        { "gameNum": 2, "gameResult": 1, "gamePoints": 10 },
        { "gameNum": 1, "pod": true, "gameResult": 0, "gamePoints": 9 }
      ]
    },
    {
      "id": "PB-G1",
      "user": { "firstName": "Gus", "lastName": "Vane" },
      "teamPlayerId": "TB-GOLD",
      "faction": { "name": "Orks", "parentFaction": { "name": "Xenos" } },
      "placing": 7,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 15 },
        { "gameNum": 2, "gameResult": 0, "gamePoints": 8 }
      ]
    },
    {
      "id": "PB-G2",
      "user": { "firstName": "Greta", "lastName": "Lind" },
      "teamPlayerId": "TB-GOLD",
      "faction": { "name": "Chaos Space Marines", "parentFaction": { "name": "Chaos" } },
      "placing": 10,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 0, "gamePoints": 5 },
        { "gameNum": 2, "gameResult": 1, "gamePoints": 10 }
      ]
    },
    {
      "id": "PB-Y1",
      "user": { "firstName": "Yara", "lastName": "Pike" },
      "teamPlayerId": "TB-GREY",
      "faction": { "name": "Death Guard", "parentFaction": { "name": "Chaos" } },
      "placing": 9,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 0, "gamePoints": 5 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 20 }
      ]
    },
    {
      "id": "PB-Y2",
      "user": { "firstName": "Yves", "lastName": "Dorn" },
      "teamPlayerId": "TB-GREY",
      "faction": { "name": "Tyranids", "parentFaction": { "name": "Xenos" } },
      "placing": 2,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 15 },
        { "gameNum": 2, "gameResult": 2, "gamePoints": 20 }
      ]
    },
    {
      "id": "PB-J1",
      "user": { "firstName": "Jon", "lastName": "Reed" },
      "teamPlayerId": "TB-JADE",
      "faction": { "name": "T'au Empire", "parentFaction": { "name": "Xenos" } },
      "placing": 4,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 20 },
        { "gameNum": 2, "gameResult": 0, "gamePoints": 5 }
      ]
    },
    {
      "id": "PB-J2",
      "user": { "firstName": "Juno", "lastName": "Frey" },
      "teamPlayerId": "TB-JADE",
      "faction": { "name": "Adepta Sororitas", "parentFaction": { "name": "Imperium" } },
      "placing": 3,
      "dropped": false,
      "listId": null,
      "total_games": [
        { "gameNum": 1, "gameResult": 2, "gamePoints": 20 },
        { "gameNum": 2, "gameResult": 1, "gamePoints": 10 }
      ]
    }
  ],
  "deleted": []
}
```

Team matchups. `team-pairings.round-1.json` (Jade Court has a bye):

```json
{
  "active": [
    {
      "id": "TPB-R1-1",
      "round": 1,
      "table": 1,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TB-RED", "name": "Red Legion" },
      "teamPlayer2": { "id": "TB-BLUE", "name": "Blue Wardens" },
      "player1Game": { "result": 2, "points": 30 },
      "player2Game": { "result": 0, "points": 10 }
    },
    {
      "id": "TPB-R1-2",
      "round": 1,
      "table": 2,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TB-GOLD", "name": "Gold Hosts" },
      "teamPlayer2": { "id": "TB-GREY", "name": "Grey Watch" },
      "player1Game": { "result": 1, "points": 20 },
      "player2Game": { "result": 1, "points": 20 }
    },
    {
      "id": "TPB-R1-3",
      "round": 1,
      "table": 3,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TB-JADE", "name": "Jade Court" },
      "player1Game": { "result": 2, "points": 40 }
    }
  ],
  "deleted": []
}
```

`team-pairings.round-2.json` (Grey Watch has a bye):

```json
{
  "active": [
    {
      "id": "TPB-R2-1",
      "round": 2,
      "table": 1,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TB-RED", "name": "Red Legion" },
      "teamPlayer2": { "id": "TB-JADE", "name": "Jade Court" },
      "player1Game": { "result": 2, "points": 25 },
      "player2Game": { "result": 0, "points": 15 }
    },
    {
      "id": "TPB-R2-2",
      "round": 2,
      "table": 2,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TB-BLUE", "name": "Blue Wardens" },
      "teamPlayer2": { "id": "TB-GOLD", "name": "Gold Hosts" },
      "player1Game": { "result": 2, "points": 22 },
      "player2Game": { "result": 0, "points": 18 }
    },
    {
      "id": "TPB-R2-3",
      "round": 2,
      "table": 3,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TB-GREY", "name": "Grey Watch" },
      "player1Game": { "result": 2, "points": 40 }
    }
  ],
  "deleted": []
}
```

`team-pairings.round-3.json` (the bracket final):

```json
{
  "active": [
    {
      "id": "TPB-R3-1",
      "round": 3,
      "table": 1,
      "pairingType": "TeamPairing",
      "teamPlayer1": { "id": "TB-RED", "name": "Red Legion" },
      "teamPlayer2": { "id": "TB-BLUE", "name": "Blue Wardens" },
      "player1Game": { "result": 2, "points": 21 },
      "player2Game": { "result": 0, "points": 19 }
    }
  ],
  "deleted": []
}
```

`pairings.round-1.first.json`, `pairings.round-2.first.json` and `pairings.round-3.first.json` are each identical. Like BCP for bracket events, `/v1/pairings` has no games:

```json
{ "data": [] }
```

Event-level games, in the shape found by the spike (no `metaData`; a bye has no `player2`). `event-games.round-1.json`:

```json
{
  "active": [
    {
      "id": "GB-R1-1",
      "round": 1,
      "table": 1,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R1-1",
      "player1": { "id": "PB-R1", "faction": "Adepta Sororitas" },
      "player2": { "id": "PB-B1", "faction": "Necrons" },
      "player1Game": { "id": "PG-1", "result": 2, "points": 20 },
      "player2Game": { "id": "PG-2", "result": 0, "points": 0 }
    },
    {
      "id": "GB-R1-2",
      "round": 1,
      "table": 2,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R1-1",
      "player1": { "id": "PB-R2", "faction": "Space Marines" },
      "player2": { "id": "PB-B2", "faction": "Aeldari" },
      "player1Game": { "id": "PG-3", "result": 1, "points": 10 },
      "player2Game": { "id": "PG-4", "result": 1, "points": 10 }
    },
    {
      "id": "GB-R1-3",
      "round": 1,
      "table": 3,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R1-2",
      "player1": { "id": "PB-G1", "faction": "Orks" },
      "player2": { "id": "PB-Y1", "faction": "Death Guard" },
      "player1Game": { "id": "PG-5", "result": 2, "points": 15 },
      "player2Game": { "id": "PG-6", "result": 0, "points": 5 }
    },
    {
      "id": "GB-R1-4",
      "round": 1,
      "table": 4,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R1-2",
      "player1": { "id": "PB-G2", "faction": "Chaos Space Marines" },
      "player2": { "id": "PB-Y2", "faction": "Tyranids" },
      "player1Game": { "id": "PG-7", "result": 0, "points": 5 },
      "player2Game": { "id": "PG-8", "result": 2, "points": 15 }
    },
    {
      "id": "GB-R1-5",
      "round": 1,
      "table": 5,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R1-3",
      "player1": { "id": "PB-J1", "faction": "T'au Empire" },
      "player1Game": { "id": "PG-9", "result": 2, "points": 20 }
    },
    {
      "id": "GB-R1-6",
      "round": 1,
      "table": 6,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R1-3",
      "player1": { "id": "PB-J2", "faction": "Adepta Sororitas" },
      "player1Game": { "id": "PG-10", "result": 2, "points": 20 }
    }
  ],
  "deleted": []
}
```

`event-games.round-2.json`:

```json
{
  "active": [
    {
      "id": "GB-R2-1",
      "round": 2,
      "table": 1,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R2-1",
      "player1": { "id": "PB-R1" },
      "player2": { "id": "PB-J1" },
      "player1Game": { "id": "PG-11", "result": 2, "points": 15 },
      "player2Game": { "id": "PG-12", "result": 0, "points": 5 }
    },
    {
      "id": "GB-R2-2",
      "round": 2,
      "table": 2,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R2-1",
      "player1": { "id": "PB-R2" },
      "player2": { "id": "PB-J2" },
      "player1Game": { "id": "PG-13", "result": 1, "points": 10 },
      "player2Game": { "id": "PG-14", "result": 1, "points": 10 }
    },
    {
      "id": "GB-R2-3",
      "round": 2,
      "table": 3,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R2-2",
      "player1": { "id": "PB-B1" },
      "player2": { "id": "PB-G1" },
      "player1Game": { "id": "PG-15", "result": 2, "points": 12 },
      "player2Game": { "id": "PG-16", "result": 0, "points": 8 }
    },
    {
      "id": "GB-R2-4",
      "round": 2,
      "table": 4,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R2-2",
      "player1": { "id": "PB-B2" },
      "player2": { "id": "PB-G2" },
      "player1Game": { "id": "PG-17", "result": 1, "points": 10 },
      "player2Game": { "id": "PG-18", "result": 1, "points": 10 }
    },
    {
      "id": "GB-R2-5",
      "round": 2,
      "table": 5,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R2-3",
      "player1": { "id": "PB-Y1" },
      "player1Game": { "id": "PG-19", "result": 2, "points": 20 }
    },
    {
      "id": "GB-R2-6",
      "round": 2,
      "table": 6,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R2-3",
      "player1": { "id": "PB-Y2" },
      "player1Game": { "id": "PG-20", "result": 2, "points": 20 }
    }
  ],
  "deleted": []
}
```

`event-games.round-3.json`:

```json
{
  "active": [
    {
      "id": "GB-R3-1",
      "round": 3,
      "table": 1,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R3-1",
      "player1": { "id": "PB-R1" },
      "player2": { "id": "PB-B2" },
      "player1Game": { "id": "PG-21", "result": 2, "points": 11 },
      "player2Game": { "id": "PG-22", "result": 0, "points": 9 }
    },
    {
      "id": "GB-R3-2",
      "round": 3,
      "table": 2,
      "pairingType": "Pairing",
      "teamPairingId": "TPB-R3-1",
      "player1": { "id": "PB-R2" },
      "player2": { "id": "PB-B1" },
      "player1Game": { "id": "PG-23", "result": 1, "points": 10 },
      "player2Game": { "id": "PG-24", "result": 1, "points": 10 }
    }
  ],
  "deleted": []
}
```

(Prettier formats these files on commit; the content is what matters.)

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/bcp/fixture-transport.test.ts`, add:

```ts
it('keeps event-level games apart from team matchups', () => {
  expect(
    fixtureFileFor({ path: '/v1/events/E1/pairings', query: { round: 2, pairingType: 'Pairing' } }),
  ).toBe('events/E1/event-games.round-2.json');
  expect(
    fixtureFileFor({
      path: '/v1/events/E1/pairings',
      query: { round: 2, pairingType: 'TeamPairing' },
    }),
  ).toBe('events/E1/team-pairings.round-2.json');
});
```

In `apps/api/src/bcp/mappers.test.ts`, add:

```ts
describe('mapEventGame', () => {
  const base = {
    id: 'G1',
    round: 1,
    table: 3,
    teamPairingId: 'TP1',
    player1: { id: 'P1' },
    player2: { id: 'P2' },
    player1Game: { result: 2, points: 15 },
    player2Game: { result: 0, points: 5 },
  };

  it('maps result and game points; the endpoint has no VP or first turn', () => {
    expect(mapEventGame(base, 'E1')).toEqual({
      bcpId: 'G1',
      eventBcpId: 'E1',
      round: 1,
      tableNo: 3,
      teamMatchupBcpId: 'TP1',
      playerABcpId: 'P1',
      playerBBcpId: 'P2',
      vpA: null,
      vpB: null,
      primaryA: null,
      primaryB: null,
      secondaryA: null,
      secondaryB: null,
      gamePointsA: 15,
      gamePointsB: 5,
      firstTurn: null,
      result: 'a_win',
    });
  });

  it('maps a draw, and a bye (no player 2) as a win for player 1', () => {
    expect(
      mapEventGame(
        { ...base, player1Game: { result: 1, points: 10 }, player2Game: { result: 1, points: 10 } },
        'E1',
      )?.result,
    ).toBe('draw');
    const bye = mapEventGame({ ...base, player2: null, player2Game: null }, 'E1');
    expect(bye).toMatchObject({ playerBBcpId: null, result: 'a_win', gamePointsB: null });
  });

  it('skips a game without player 1', () => {
    expect(mapEventGame({ ...base, player1: null }, 'E1')).toBeNull();
  });
});
```

In `apps/api/src/bcp/source.test.ts`, add:

```ts
it('reads event-level games (bracket events)', async () => {
  const games = await source.getEventGames('EVTBRACKET01', 1);
  expect(games).toHaveLength(6);
  expect(games.find((g) => g.bcpId === 'GB-R1-5')).toMatchObject({
    playerABcpId: 'PB-J1',
    playerBBcpId: null,
    result: 'a_win',
    vpA: null,
  });
  expect(await source.getGames('EVTBRACKET01', 1)).toEqual([]);
});
```

Create `apps/api/src/sync/round-pairings.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { games, teamMatchups } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { sampleSource, silentLogger } from '../test/helpers';
import { syncRoundPairings } from './round-pairings';

let db: Db;
let close: () => Promise<void>;
const deps = () => ({ db, source: sampleSource(), logger: silentLogger });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

describe('syncRoundPairings', () => {
  it('stores individual games from /v1/pairings when BCP has them', async () => {
    const outcome = await syncRoundPairings(deps(), { id: 'EVTTEAM0001', isTeamEvent: true }, 1);
    expect(outcome).toEqual({ matchups: 2, games: 4, gamesFrom: 'pairings' });
  });

  it('falls back to the event-level endpoint for bracket events, with no VP', async () => {
    const outcome = await syncRoundPairings(deps(), { id: 'EVTBRACKET01', isTeamEvent: true }, 1);
    expect(outcome).toEqual({ matchups: 3, games: 6, gamesFrom: 'event' });

    const stored = await db.select().from(games).where(eq(games.eventId, 'EVTBRACKET01'));
    expect(stored).toHaveLength(6);
    expect(stored.every((g) => g.vpA === null && g.vpB === null)).toBe(true);
    expect(stored.find((g) => g.id === 'GB-R1-5')).toMatchObject({
      playerBId: null,
      result: 'a_win',
      gamePointsA: 20,
    });
    const matchups = await db
      .select()
      .from(teamMatchups)
      .where(eq(teamMatchups.eventId, 'EVTBRACKET01'));
    expect(matchups.find((m) => m.id === 'TPB-R1-3')).toMatchObject({ teamBId: null, pointsA: 40 });
  });
});
```

(The sample event's round 1 has 4 games over two pages of `/v1/pairings`.)

Run: `pnpm vitest run --project api src/bcp src/sync/round-pairings.test.ts`
Expected: FAIL. `mapEventGame`, `getEventGames` and `./round-pairings` don't exist, and the fixture path maps to `team-pairings`.

- [ ] **Step 3: Implement the fallback**

In `apps/api/src/bcp/fixture-transport.ts`, change the event `pairings` branch:

```ts
if (sub === 'pairings') {
  // The same URL serves team matchups and (for bracket events) individual games.
  const kind = query.pairingType === 'Pairing' ? 'event-games' : 'team-pairings';
  return `events/${safeSegment(id)}/${kind}.round-${round}.json`;
}
```

In `apps/api/src/bcp/raw.ts`, below `RawPairing`, add:

```ts
/** An individual game from `/v1/events/{id}/pairings?pairingType=Pairing`: results, no metaData. */
export const RawEventGame = z.object({
  id: z.string(),
  round: z.number(),
  table: z.number().nullish(),
  teamPairingId: z.string().nullish(),
  player1: z.object({ id: z.string() }).nullish(),
  player2: z.object({ id: z.string() }).nullish(),
  player1Game: RawSideResult,
  player2Game: RawSideResult,
});
export type RawEventGame = z.output<typeof RawEventGame>;
```

(`RawSideResult` is declared above `RawTeamPairing`. Keep `RawEventGame` below it.)

In `apps/api/src/bcp/mappers.ts`, import `type RawEventGame` and add:

```ts
/**
 * A game from the event-level endpoint (bracket/GW team events). It carries each side's result
 * and game points but no VP, primary, secondary or first turn. A game without player 2 is a
 * bye, which BCP scores as a win for player 1.
 */
export function mapEventGame(raw: RawEventGame, eventId: string): Game | null {
  if (!raw.player1) return null;
  const pointsA = raw.player1Game?.points ?? null;
  const pointsB = raw.player2Game?.points ?? null;
  const result = raw.player2
    ? toGameResult(raw.player1Game?.result ?? null, raw.player2Game?.result ?? null)
    : 'a_win';
  return {
    bcpId: raw.id,
    eventBcpId: eventId,
    round: raw.round,
    tableNo: raw.table ?? null,
    teamMatchupBcpId: raw.teamPairingId ?? null,
    playerABcpId: raw.player1.id,
    playerBBcpId: raw.player2?.id ?? null,
    vpA: null,
    vpB: null,
    primaryA: null,
    primaryB: null,
    secondaryA: null,
    secondaryB: null,
    gamePointsA: pointsA,
    gamePointsB: pointsB,
    firstTurn: null,
    result,
  };
}
```

In `apps/api/src/bcp/source.ts`:

- add `getEventGames(eventId: string, round: number): Promise<Fetched<Game>[]>;` to `TournamentSource`, with the doc comment `/** A round's individual games from the event-level endpoint; BCP serves bracket events' games only here. */`;
- implement it in `BcpSource` below `getGames`:

```ts
  async getEventGames(eventId: string, round: number): Promise<Fetched<Game>[]> {
    const path = `/v1/events/${encodeURIComponent(eventId)}/pairings`;
    const body = parseBcp(
      RawListEnvelope,
      await this.#transport.get({ path, query: { round, pairingType: 'Pairing' } }),
      path,
    );
    return parseItems(RawEventGame, body.active, path).flatMap(({ parsed, raw }) => {
      const game = mapEventGame(parsed, eventId);
      return game ? [{ ...game, raw }] : [];
    });
  }
```

Create `apps/api/src/sync/round-pairings.ts`:

```ts
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import { replaceRoundPairings } from '../repo/pairings';

export interface RoundPairingsOutcome {
  matchups: number;
  games: number;
  /** Where the games came from; 'none' when neither endpoint had any. */
  gamesFrom: 'pairings' | 'event' | 'none';
}

/**
 * Fetches and stores one round: team matchups (team events), then individual games from
 * `/v1/pairings`. Bracket/GW team events have no games there, so when a round has team matchups
 * but no games, the event-level endpoint is asked instead (its games carry no VP).
 */
export async function syncRoundPairings(
  deps: { db: Db; source: TournamentSource; logger: Logger },
  event: { id: string; isTeamEvent: boolean },
  round: number,
): Promise<RoundPairingsOutcome> {
  const { db, source, logger } = deps;
  const teamMatchups = event.isTeamEvent ? await source.getTeamMatchups(event.id, round) : [];
  let games = await source.getGames(event.id, round);
  let gamesFrom: RoundPairingsOutcome['gamesFrom'] = games.length > 0 ? 'pairings' : 'none';
  if (games.length === 0 && teamMatchups.length > 0) {
    games = await source.getEventGames(event.id, round);
    if (games.length > 0) gamesFrom = 'event';
  }
  if (teamMatchups.length > 0 && games.length === 0) {
    logger.warn(
      { eventId: event.id, round },
      `BCP returned no individual games for round ${round}; team matchups stored only`,
    );
  }
  await replaceRoundPairings(db, event.id, round, { teamMatchups, games });
  return { matchups: teamMatchups.length, games: games.length, gamesFrom };
}
```

In `apps/api/src/sync/jobs.ts`:

- **export** `syncEvent`;
- replace the body of `syncPairings`'s loop with the new function. Task 3 removes the job entirely; until then it must keep working.

```ts
for (let round = 1; round <= event.roundCount; round += 1) {
  await syncRoundPairings({ ...ctx }, { id: eventId, isTeamEvent: event.isTeamEvent }, round);
  await ctx.progress.succeeded();
}
```

Remove the now-unused `replaceRoundPairings` import. In `apps/api/src/sync/runner.test.ts`, the test "pairings: warns when a team round has matchups but no individual games" still passes if its fake source has no event-level games either. Add `getEventGames: () => Promise.resolve([])` to that fake source; otherwise the test would take the fallback path.

Add `getEventGames` to every other hand-written `TournamentSource` in tests. Delegating fakes forward it (`getEventGames: (id, round) => source.getEventGames(id, round)`); stubs return `Promise.resolve([])`. Find them with `grep -rn "TournamentSource = {\|getTeamMatchups:" apps/api/src`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project api`
Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): fetch bracket events' games from the event-level endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rename the list queue to the fetch queue (no behaviour change)

A mechanical rename, so task 3's job kinds land in code named for what it becomes. No behaviour changes: every existing test keeps asserting what it asserted, with the new names.

**Files:**

- Create: `apps/api/drizzle/0003_fetch-queue.sql` (hand-written), its snapshot and journal entry (via `drizzle-kit generate --custom`), and `apps/api/src/db/migrations.test.ts`
- Rename (`git mv`):

  | From                                               | To                                                  |
  | -------------------------------------------------- | --------------------------------------------------- |
  | `apps/api/src/list-queue/`                         | `apps/api/src/fetch-queue/`                         |
  | `apps/api/src/repo/list-queue.ts` (+ `.test.ts`)   | `apps/api/src/repo/fetch-queue.ts` (+ `.test.ts`)   |
  | `apps/api/src/routes/list-queue.ts` (+ `.test.ts`) | `apps/api/src/routes/fetch-queue.ts` (+ `.test.ts`) |
  | `apps/web/src/features/list-queue/`                | `apps/web/src/features/fetch-queue/`                |
  | `…/fetch-queue/list-queue-api.ts` (+ test)         | `…/fetch-queue/fetch-queue-api.ts` (+ test)         |
  | `…/fetch-queue/list-queue-queries.ts`              | `…/fetch-queue/fetch-queue-queries.ts`              |
  | `…/fetch-queue/ListQueueCard.tsx`                  | `…/fetch-queue/FetchQueueCard.tsx`                  |

- Modify: every file `git grep -il "list-queue\|listQueue\|ListQueue\|list_queue\|LIST_QUEUE"` lists outside `docs/` and `apps/api/drizzle/0000–0002` (about 45 files).

**Interfaces:**

- Consumes: plan 3's queue.
- Produces (identifier renames; later tasks use only the new names):

  | Old                                                                                       | New                                                                           |
  | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
  | table `list_queue`, enum `list_queue_status`                                              | `fetch_queue`, `fetch_queue_status`                                           |
  | Drizzle `listQueue`, `listQueueStatus`                                                    | `fetchQueue`, `fetchQueueStatus`                                              |
  | `ListQueueWorker`, `ListQueueWorkerOptions`                                               | `FetchQueueWorker`, `FetchQueueWorkerOptions`                                 |
  | `AppDeps.listQueue`, `testListQueue(db, source?)`                                         | `AppDeps.fetchQueue`, `testFetchQueue(db, source?)`                           |
  | `ListQueueStateSchema`/`ListQueueState`                                                   | `FetchQueueStateSchema`/`FetchQueueState`                                     |
  | `ListQueuePauseReasonSchema`/`ListQueuePauseReason`                                       | `FetchQueuePauseReasonSchema`/`FetchQueuePauseReason`                         |
  | `ListQueueStatus` (repo type)                                                             | `FetchQueueStatus`                                                            |
  | `claimNextList`, `markListDone`, `markListFailed`, `retryListLater`, `releaseList`        | `claimNextJob`, `markJobDone`, `markJobFailed`, `retryJobLater`, `releaseJob` |
  | `retryFailedLists`                                                                        | `retryFailedJobs`                                                             |
  | `ClaimedList`                                                                             | `ClaimedJob`                                                                  |
  | routes `/api/list-queue`, `/api/list-queue/{pause,resume,retry-failed}`                   | `/api/fetch-queue`, `/api/fetch-queue/{pause,resume,retry-failed}`            |
  | `listQueueRoutes`                                                                         | `fetchQueueRoutes`                                                            |
  | config `LIST_QUEUE_INTERVAL_MS`                                                           | `FETCH_QUEUE_INTERVAL_MS` (old name still read as a fallback)                 |
  | web `listQueueQuery` (key `['list-queue']`)                                               | `fetchQueueQuery` (key `['fetch-queue']`)                                     |
  | web `ListQueueCard`                                                                       | `FetchQueueCard`                                                              |
  | logger module `list-queue`, log message `'List queue fetch'` / `'List queue tick failed'` | `fetch-queue`, `'Fetch queue job'` / `'Fetch queue tick failed'`              |

  **Unchanged on purpose:** `enqueueLists`, `cancelQueuedLists`, `latestQueueRowsByPlayer`, `queueEventLists`, `queueLists`, `describeQueueResult`, `SINGLE_LIST_PRIORITY`, `NO_LIST_CODE`, `EventDetail.listQueueSeconds` (task 3 renames it), `/api/events/:id/lists/queue`, and the user-visible copy ("Lists · …", "List queue" card title; task 7 changes the copy).

- [ ] **Step 1: Write the migration test** (Review Focus 5)

Create `apps/api/src/db/migrations.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../drizzle/0003_fetch-queue.sql', import.meta.url), 'utf8');

describe('0003_fetch-queue migration', () => {
  it('renames the list queue in place, so queued lists survive', () => {
    expect(sql).toContain('ALTER TABLE "list_queue" RENAME TO "fetch_queue"');
    expect(sql).toContain('ALTER TYPE "public"."list_queue_status" RENAME TO "fetch_queue_status"');
    expect(sql).not.toMatch(/DROP TABLE|CREATE TABLE/i);
  });
});
```

Run: `pnpm vitest run --project api src/db/migrations.test.ts`
Expected: FAIL (ENOENT: the migration doesn't exist).

- [ ] **Step 2: Rename the schema and write the migration by hand**

In `apps/api/src/db/schema.ts`, rename `listQueueStatus` → `fetchQueueStatus` (pg name `fetch_queue_status`) and `listQueue` → `fetchQueue` (table `fetch_queue`). Rename the indexes to `fetch_queue_one_open_idx`, `fetch_queue_claim_idx` and `fetch_queue_event_idx`, and update the doc comment ("Jobs waiting to reach BCP (army lists for now), …; drained slowly by the FetchQueueWorker.").

`drizzle-kit generate` asks interactively whether a table was renamed, which can't be answered here. Generate an empty custom migration instead, which still records the new snapshot:

Run: `pnpm --filter @bcp/api exec drizzle-kit generate --custom --name fetch-queue`
Expected: creates `apps/api/drizzle/0003_fetch-queue.sql` (empty), `meta/0003_snapshot.json` and a journal entry.

Write the SQL (statements separated by Drizzle's breakpoint marker):

```sql
ALTER TABLE "list_queue" RENAME TO "fetch_queue";--> statement-breakpoint
ALTER TYPE "public"."list_queue_status" RENAME TO "fetch_queue_status";--> statement-breakpoint
ALTER SEQUENCE "list_queue_id_seq" RENAME TO "fetch_queue_id_seq";--> statement-breakpoint
ALTER TABLE "fetch_queue" RENAME CONSTRAINT "list_queue_pkey" TO "fetch_queue_pkey";--> statement-breakpoint
ALTER TABLE "fetch_queue" RENAME CONSTRAINT "list_queue_event_id_events_id_fk" TO "fetch_queue_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "fetch_queue" RENAME CONSTRAINT "list_queue_player_id_players_id_fk" TO "fetch_queue_player_id_players_id_fk";--> statement-breakpoint
ALTER INDEX "list_queue_one_open_idx" RENAME TO "fetch_queue_one_open_idx";--> statement-breakpoint
ALTER INDEX "list_queue_claim_idx" RENAME TO "fetch_queue_claim_idx";--> statement-breakpoint
ALTER INDEX "list_queue_event_idx" RENAME TO "fetch_queue_event_idx";
```

Check the exact existing constraint names in `apps/api/drizzle/0002_list-queue.sql` and `meta/0002_snapshot.json` (the primary key may be unnamed in the SQL, in which case Postgres named it `list_queue_pkey`), and match them. Then verify that the snapshot agrees with the schema:

Run: `pnpm --filter @bcp/api db:generate`
Expected: "No schema changes, nothing to migrate". If it wants to generate something, the snapshot and schema disagree: fix the schema names, and do not commit a second migration.

In `apps/api/src/db/test-db.ts`, `resetDb` truncates `fetch_queue` instead of `list_queue`.

- [ ] **Step 3: Rename the code**

Move files with `git mv` per the table, then replace identifiers per the Interfaces table. Suggested approach: `git grep -l` the old names (excluding `docs/` and `apps/api/drizzle/`), then review each file's diff; don't blind-replace inside migration SQL or snapshots. The user-visible copy listed as unchanged stays.

Config (`apps/api/src/config.ts`): rename the key and read the old one as a fallback:

```ts
  /** One fetch-queue job (a list, an event or a pairings round) every N ms. Keep it gentle. */
  FETCH_QUEUE_INTERVAL_MS: z.coerce.number().int().min(100).default(5000),
```

```ts
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // `KEY=` in .env yields "", which should mean "not set" rather than "invalid".
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  // Plan 3 called it LIST_QUEUE_INTERVAL_MS; keep honouring existing .env files.
  defined.FETCH_QUEUE_INTERVAL_MS ??= defined.LIST_QUEUE_INTERVAL_MS;
  const result = EnvSchema.safeParse(defined);
```

Add to `apps/api/src/config.test.ts`:

```ts
it('reads the fetch queue pace, falling back to the plan 3 name', () => {
  expect(loadConfig({ FETCH_QUEUE_INTERVAL_MS: '300' }).FETCH_QUEUE_INTERVAL_MS).toBe(300);
  expect(loadConfig({ LIST_QUEUE_INTERVAL_MS: '400' }).FETCH_QUEUE_INTERVAL_MS).toBe(400);
  expect(loadConfig({}).FETCH_QUEUE_INTERVAL_MS).toBe(5000);
});
```

Also rename it in `.env.example` (comment: "One BCP fetch-queue job every N ms. Keep it gentle: BCP has no public API.") and in `playwright.config.ts` (`FETCH_QUEUE_INTERVAL_MS: '200'`). In `README.md`, update the variable name only.

- [ ] **Step 4: Run everything**

Run: `pnpm check`
Expected: PASS. The test count is unchanged, plus the two new tests.

Run: `git grep -in "list-queue\|listQueue\|ListQueue\|list_queue" -- ':!docs' ':!apps/api/drizzle/0002*' ':!apps/api/drizzle/meta/0002*' ':!apps/api/drizzle/meta/_journal.json'`
Expected: only the fallback line in `config.ts`, its test, and the migration SQL.

Run: `pnpm e2e`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename the list queue to the fetch queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Job kinds, the pairings queue route, and retiring the `pairings` sync

**Files:**

- Modify: `apps/api/src/db/schema.ts` (+ generated migration `0004_*`), `apps/api/src/repo/fetch-queue.ts` (+ test), `apps/api/src/fetch-queue/worker.ts` (+ test), `apps/api/src/repo/pairings.ts` (+ test), `apps/api/src/routes/fetch-queue.ts` (+ test), `apps/api/src/event-detail.ts`, `apps/api/src/repo/sync-runs.ts` (+ test), `apps/api/src/sync/jobs.ts`, `apps/api/src/sync/runner.test.ts`, `apps/api/src/routes/event-routes.test.ts`
- Create: `apps/api/src/fetch-queue/queue-pairings.ts`
- Modify (shared): `packages/shared/src/api.ts`, `packages/shared/src/sync.ts`, `packages/shared/src/schemas.test.ts`
- Modify (web, compile and behaviour fixes only): `apps/web/src/test/sample-data.ts`, `apps/web/src/features/event/EventQueueLine.tsx` (+ test), `apps/web/src/features/event/ListDrawer.tsx` (+ test), `apps/web/src/features/fetch-queue/*.test.tsx` (queue state samples), `apps/web/src/features/sync/follow-sync.test.ts`

**Interfaces:**

- Consumes: `syncEvent(deps, eventId)` and `syncRoundPairings(deps, event, round)` (task 1); the renamed queue (task 2).
- Produces:
  - **DB:**
    - enum `fetch_job_kind` (`list` | `event` | `pairings-round`);
    - `fetch_queue.kind` (default `list`), `fetch_queue.round`, `fetch_queue.follow_up`, with `player_id`/`list_id` now nullable;
    - `events.pairings_synced_at`.
  - **Repo** (`repo/fetch-queue.ts`):
    - `type FetchJobKind`, `USER_WAITING_PRIORITY = 10` (and `SINGLE_LIST_PRIORITY = USER_WAITING_PRIORITY`);
    - `enqueueEventPairings(db, eventId, { rounds: number[] | null; priority: number }): Promise<{ eventQueued: boolean; queuedRounds: number }>`, where `rounds: null` queues an `event` job with follow-up `pairings`;
    - `markPairingsSyncedIfComplete(db, eventId, roundCount, at?): Promise<boolean>`;
    - `eventPairingsJobs(db, eventId): Promise<{ queued: number; failed: number }>`;
    - `queueTotals(db)` now also returns `byKind`.
  - **Repo** (`repo/pairings.ts`): `storedPairingsSummary(db, eventId): Promise<{ rounds: number; matchups: number; games: number }>`.
  - **Service:** `queueEventPairings(deps: { db: Db; fetchQueue: FetchQueueWorker }, eventId: string, priority: number): Promise<QueuePairingsResult>`.
  - **Route:** `POST /api/events/:id/pairings/queue` (JSON body `{}`), which queues at priority 10.
  - **Shared:**
    - `FetchJobKindSchema`;
    - `FetchQueueState.totals.byKind: Record<FetchJobKind, { queued; fetching; failed }>`;
    - `QueuePairingsResultSchema = { eventQueued: boolean; queuedRounds: number; estimatedSeconds: number | null }`;
    - `EventPairingsSchema = { syncedAt: string | null; roundCount: number; roundsDone: number; queued: number; failed: number; gamesAvailable: boolean }`;
    - `EventDetail.pairings: EventPairings`; `EventDetail.queueSeconds` (renamed from `listQueueSeconds`);
    - `EventSyncs = { event }`; `SyncRequest` without `pairings`.

- [ ] **Step 1: Shared contract**

In `packages/shared/src/sync.ts`, remove the `pairings` member from `SyncRequestSchema` (`SyncKindSchema` keeps it for history rows).

In `packages/shared/src/api.ts`:

```ts
export const FetchJobKindSchema = z.enum(['list', 'event', 'pairings-round']);
export type FetchJobKind = z.infer<typeof FetchJobKindSchema>;

const JobTotalsSchema = z.object({
  queued: z.number().int().nonnegative(),
  fetching: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
```

- `FetchQueueStateSchema.totals` becomes `JobTotalsSchema.extend({ byKind: z.record(FetchJobKindSchema, JobTotalsSchema) })`. The top-level totals stay the sums over all kinds.
- `EventSyncsSchema` becomes `z.object({ event: SyncRunSchema.nullable() })`.
- Add, and use in `EventDetailSchema` (renaming `listQueueSeconds` → `queueSeconds`):

```ts
/** What is stored and queued of an event's pairings. */
export const EventPairingsSchema = z.object({
  /** Set when every round's newest fetch succeeded (fetch queue); null otherwise. */
  syncedAt: z.iso.datetime().nullable(),
  roundCount: z.number().int().nonnegative(),
  /** Rounds with stored team matchups or games. */
  roundsDone: z.number().int().nonnegative(),
  /** Open event/pairings jobs for this event. */
  queued: z.number().int().nonnegative(),
  /** Rounds whose newest pairings job failed. */
  failed: z.number().int().nonnegative(),
  /** False when team matchups are stored but BCP served no individual games. */
  gamesAvailable: z.boolean(),
});
export type EventPairings = z.infer<typeof EventPairingsSchema>;

export const QueuePairingsResultSchema = z.object({
  /** An event job was queued (or already open) because the event was never synced. */
  eventQueued: z.boolean(),
  queuedRounds: z.number().int().nonnegative(),
  estimatedSeconds: z.number().int().nonnegative().nullable(),
});
export type QueuePairingsResult = z.infer<typeof QueuePairingsResultSchema>;
```

```ts
  /** Seconds until this event's queued jobs (lists and pairings) are done; null when none. */
  queueSeconds: z.number().int().nonnegative().nullable(),
  pairings: EventPairingsSchema,
```

In `packages/shared/src/schemas.test.ts`:

- update the `EventDetail` sample: `syncs: { event: null }`, `queueSeconds: null`, and `pairings: { syncedAt: null, roundCount: 2, roundsDone: 0, queued: 0, failed: 0, gamesAvailable: true }`;
- update the `FetchQueueState` sample with `byKind` for all three kinds;
- add `expect(SyncRequestSchema.safeParse({ kind: 'pairings', eventId: 'E1' }).success).toBe(false)`.

- [ ] **Step 2: Schema and migration**

In `apps/api/src/db/schema.ts`:

```ts
export const fetchJobKind = pgEnum('fetch_job_kind', ['list', 'event', 'pairings-round']);
```

`fetchQueue` changes:

```ts
    kind: fetchJobKind('kind').notNull().default('list'),
    eventId: …unchanged…,
    /** Only list jobs have a player and list. */
    playerId: text('player_id').references(() => players.id, { onDelete: 'cascade' }),
    listId: text('list_id'),
    /** Only pairings-round jobs have a round. */
    round: integer('round'),
    /** 'pairings' on an event job queued so pairings can follow: it queues the rounds when done. */
    followUp: text('follow_up'),
```

and its constraints:

```ts
  (t) => [
    // At most one open job per target: queueing twice is a no-op.
    uniqueIndex('fetch_queue_one_open_idx')
      .on(t.playerId)
      .where(sql`${t.kind} = 'list' and ${t.status} in ('queued', 'fetching')`),
    uniqueIndex('fetch_queue_one_open_event_idx')
      .on(t.eventId)
      .where(sql`${t.kind} = 'event' and ${t.status} in ('queued', 'fetching')`),
    uniqueIndex('fetch_queue_one_open_round_idx')
      .on(t.eventId, t.round)
      .where(sql`${t.kind} = 'pairings-round' and ${t.status} in ('queued', 'fetching')`),
    index('fetch_queue_claim_idx').on(t.status, desc(t.priority), t.queuedAt),
    index('fetch_queue_event_idx').on(t.eventId, t.status),
    check(
      'fetch_queue_list_target',
      sql`${t.kind} <> 'list' or (${t.playerId} is not null and ${t.listId} is not null)`,
    ),
    check('fetch_queue_round_target', sql`${t.kind} <> 'pairings-round' or ${t.round} is not null`),
  ],
```

In `events`, add `/** Set when every round's pairings were fetched by the fetch queue. */ pairingsSyncedAt: timestamptz('pairings_synced_at'),`.

Run: `pnpm --filter @bcp/api db:generate --name fetch-job-kinds`
Expected: `0004_fetch-job-kinds.sql`, which creates the enum, adds the columns (existing rows get kind `list`), drops `NOT NULL` from `player_id`/`list_id`, recreates `fetch_queue_one_open_idx` with its new condition, and adds the new indexes and checks. Read it. It must not drop the table. Then run `db:generate` again and expect no changes.

- [ ] **Step 3: Write the failing repository tests** (Review Focus 2)

Add to `apps/api/src/repo/fetch-queue.test.ts` (it already seeds `EVTTEAM0001`'s event and players):

```ts
describe('pairings jobs', () => {
  const kinds = async () =>
    (await db.select().from(fetchQueue).orderBy(fetchQueue.id)).map((r) => [
      r.kind,
      r.round,
      r.priority,
      r.status,
    ]);

  it('queues each round once while open, alongside list jobs', async () => {
    await enqueueLists(db, EVENT, [ada], 0);
    expect(await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 })).toEqual({
      eventQueued: false,
      queuedRounds: 2,
    });
    expect(await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 })).toEqual({
      eventQueued: false,
      queuedRounds: 0,
    });
    expect(await kinds()).toEqual([
      ['list', null, 0, 'queued'],
      ['pairings-round', 1, 0, 'queued'],
      ['pairings-round', 2, 0, 'queued'],
    ]);
  });

  it('raises an event’s queued jobs when the user asks from the event page', async () => {
    await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 });
    await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: USER_WAITING_PRIORITY });
    expect((await kinds()).map(([, , priority]) => priority)).toEqual([10, 10]);
  });

  it('queues one event job with a pairings follow-up for a never-synced event', async () => {
    expect(await enqueueEventPairings(db, EVENT, { rounds: null, priority: 0 })).toEqual({
      eventQueued: true,
      queuedRounds: 0,
    });
    expect(
      await enqueueEventPairings(db, EVENT, { rounds: null, priority: USER_WAITING_PRIORITY }),
    ).toEqual({
      eventQueued: true,
      queuedRounds: 0,
    });
    const rows = await db.select().from(fetchQueue);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'event', followUp: 'pairings', priority: 10 });
  });

  it('retries a failed round only when it is that round’s newest job', async () => {
    await enqueueEventPairings(db, EVENT, { rounds: [1], priority: 0 });
    const first = await claimNextJob(db, soon());
    await markJobFailed(db, first!.id, 'BCP down', 'BCP_UNAVAILABLE');
    await enqueueEventPairings(db, EVENT, { rounds: [1], priority: 0 });
    expect(await retryFailedJobs(db, EVENT)).toBe(0); // a newer round-1 job is open
    const second = await claimNextJob(db, soon());
    await markJobFailed(db, second!.id, 'BCP down', 'BCP_UNAVAILABLE');
    expect(await retryFailedJobs(db, EVENT)).toBe(1);
  });

  it('counts totals by kind and an event’s pairings jobs', async () => {
    await enqueueLists(db, EVENT, [ada, ben], 0);
    await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 });
    const firstClaimed = await claimNextJob(db, soon()); // Ada's list: queued first
    await markJobFailed(db, firstClaimed!.id, 'x', 'INTERNAL');
    const totals = await queueTotals(db);
    expect(totals.byKind['pairings-round']).toEqual({ queued: 2, fetching: 0, failed: 0 });
    expect(totals.byKind.list).toEqual({ queued: 1, fetching: 0, failed: 1 });
    expect(await eventPairingsJobs(db, EVENT)).toEqual({ queued: 2, failed: 0 });
  });

  it('marks pairings synced once every round’s newest job is done', async () => {
    await enqueueEventPairings(db, EVENT, { rounds: [1, 2], priority: 0 });
    const one = await claimNextJob(db, soon());
    await markJobDone(db, one!.id);
    expect(await markPairingsSyncedIfComplete(db, EVENT, 2)).toBe(false);
    const two = await claimNextJob(db, soon());
    await markJobDone(db, two!.id);
    expect(await markPairingsSyncedIfComplete(db, EVENT, 2)).toBe(true);
    const [event] = await db.select().from(events).where(eq(events.id, EVENT));
    expect(event?.pairingsSyncedAt).toBeInstanceOf(Date);
  });
});
```

(`soon()` is the file's existing helper, a clock 60 s ahead. Import `events` from `../db/schema` alongside `fetchQueue`. The totals test depends on the claim order: `enqueueLists` rows were queued first, so the first claim is Ada's list job. Adjust the names in the assertion if the helper order differs, but keep what it checks: per-kind totals, list failures counted per kind, and `eventPairingsJobs` counting only pairings jobs.)

Run: `pnpm vitest run --project api src/repo/fetch-queue.test.ts`
Expected: FAIL (the functions don't exist).

- [ ] **Step 4: Implement the repository**

In `apps/api/src/repo/fetch-queue.ts`:

```ts
export type FetchJobKind = (typeof fetchQueue.$inferSelect)['kind'];

/** Priority of work someone is waiting for (a single list, an event page's pairings); normal is 0. */
export const USER_WAITING_PRIORITY = 10;
/** Priority of a single list someone is waiting for. */
export const SINGLE_LIST_PRIORITY = USER_WAITING_PRIORITY;

export interface ClaimedJob {
  id: number;
  kind: FetchJobKind;
  eventId: string;
  playerId: string | null;
  listId: string | null;
  round: number | null;
  followUp: string | null;
  priority: number;
  attempts: number;
}
```

- `claimNextJob` returns those fields (add `kind`, `round`, `followUp` and `priority` to `.returning`).
- `enqueueLists` inserts `kind: 'list'`, and its priority bump also filters `eq(fetchQueue.kind, 'list')`.

Then add:

```ts
const OPEN = ['queued', 'fetching'] as const;
const PAIRINGS_KINDS = ['event', 'pairings-round'] as const;

/**
 * Queues an event's pairings. With rounds, one pairings-round job per round (rounds with an open
 * job are skipped). With `rounds: null` (the event was never synced, so its round count is
 * unknown) one event job whose follow-up queues the rounds when it is done. At the user-waiting
 * priority, the event's queued pairings jobs are raised too, so an event page jumps the queue.
 */
export async function enqueueEventPairings(
  db: Db,
  eventId: string,
  { rounds, priority }: { rounds: number[] | null; priority: number },
): Promise<{ eventQueued: boolean; queuedRounds: number }> {
  let result: { eventQueued: boolean; queuedRounds: number };
  if (rounds === null) {
    await db
      .insert(fetchQueue)
      .values({ kind: 'event', eventId, priority, followUp: 'pairings' })
      .onConflictDoNothing();
    // Queued before without the follow-up (or both callers raced): make sure pairings follow.
    await db
      .update(fetchQueue)
      .set({ followUp: 'pairings' })
      .where(
        and(
          eq(fetchQueue.eventId, eventId),
          eq(fetchQueue.kind, 'event'),
          inArray(fetchQueue.status, [...OPEN]),
        ),
      );
    result = { eventQueued: true, queuedRounds: 0 };
  } else {
    const inserted =
      rounds.length === 0
        ? []
        : await db
            .insert(fetchQueue)
            .values(
              rounds.map((round) => ({
                kind: 'pairings-round' as const,
                eventId,
                round,
                priority,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: fetchQueue.id });
    result = { eventQueued: false, queuedRounds: inserted.length };
  }
  if (priority >= USER_WAITING_PRIORITY) {
    await db
      .update(fetchQueue)
      .set({ priority })
      .where(
        and(
          eq(fetchQueue.eventId, eventId),
          inArray(fetchQueue.kind, [...PAIRINGS_KINDS]),
          eq(fetchQueue.status, 'queued'),
          lt(fetchQueue.priority, priority),
        ),
      );
  }
  return result;
}
```

The newest job per target replaces "newest row per player". The target is `(kind, event_id, player_id, round)`: nulls compare equal in `DISTINCT ON`, and `is not distinct from` in the retry check.

```ts
function newestJobPerTarget(db: Db, where?: SQL) {
  return db
    .selectDistinctOn(
      [fetchQueue.kind, fetchQueue.eventId, fetchQueue.playerId, fetchQueue.round],
      {
        kind: fetchQueue.kind,
        eventId: fetchQueue.eventId,
        playerId: fetchQueue.playerId,
        round: fetchQueue.round,
        status: fetchQueue.status,
        error: fetchQueue.error,
        errorCode: fetchQueue.errorCode,
      },
    )
    .from(fetchQueue)
    .where(where)
    .orderBy(
      fetchQueue.kind,
      fetchQueue.eventId,
      fetchQueue.playerId,
      fetchQueue.round,
      desc(fetchQueue.id),
    );
}
```

- `latestQueueRowsByPlayer(db, eventId)` uses `newestJobPerTarget(db, and(eq(fetchQueue.kind, 'list'), eq(fetchQueue.eventId, eventId)))` and skips rows whose `playerId` is null.
- `retryFailedJobs`'s `notExists` compares the same target:

```ts
          db
            .select({ id: newer.id })
            .from(newer)
            .where(
              and(
                eq(newer.kind, fetchQueue.kind),
                eq(newer.eventId, fetchQueue.eventId),
                sql`${newer.playerId} is not distinct from ${fetchQueue.playerId}`,
                sql`${newer.round} is not distinct from ${fetchQueue.round}`,
                gt(newer.id, fetchQueue.id),
              ),
            ),
```

- `queueTotals` groups the open counts by `kind` and `status`, and counts failures from `newestJobPerTarget(db)` with `isRetryableFailure` per kind. It returns `{ queued, fetching, failed, byKind }`, where `byKind` always has all three kinds, zeros included.

```ts
/** Open pairings work for an event, and rounds whose newest pairings job failed. */
export async function eventPairingsJobs(
  db: Db,
  eventId: string,
): Promise<{ queued: number; failed: number }> {
  const [open] = await db
    .select({ n: count() })
    .from(fetchQueue)
    .where(
      and(
        eq(fetchQueue.eventId, eventId),
        inArray(fetchQueue.kind, [...PAIRINGS_KINDS]),
        inArray(fetchQueue.status, [...OPEN]),
      ),
    );
  const newest = await newestJobPerTarget(
    db,
    and(eq(fetchQueue.eventId, eventId), eq(fetchQueue.kind, 'pairings-round')),
  );
  return {
    queued: open?.n ?? 0,
    failed: newest.filter((row) => row.status === 'failed').length,
  };
}

/**
 * Sets `events.pairings_synced_at` when no pairings job of the event is open and every round
 * 1..roundCount has a newest pairings-round job that is done. Returns whether it did.
 */
export async function markPairingsSyncedIfComplete(
  db: Db,
  eventId: string,
  roundCount: number,
  at = new Date(),
): Promise<boolean> {
  if (roundCount === 0) return false;
  const { queued } = await eventPairingsJobs(db, eventId);
  if (queued > 0) return false;
  const newest = await newestJobPerTarget(
    db,
    and(eq(fetchQueue.eventId, eventId), eq(fetchQueue.kind, 'pairings-round')),
  );
  const done = new Set(newest.filter((row) => row.status === 'done').map((row) => row.round));
  for (let round = 1; round <= roundCount; round += 1) if (!done.has(round)) return false;
  await db.update(events).set({ pairingsSyncedAt: at }).where(eq(events.id, eventId));
  return true;
}
```

`queuedInOrder` also returns `kind`. Import `events` from `../db/schema`, and `lt` and `type SQL` from `drizzle-orm`.

In `apps/api/src/repo/pairings.ts`, add:

```ts
/** How much of an event's pairings is stored: distinct rounds, team matchups and games. */
export async function storedPairingsSummary(
  db: Db,
  eventId: string,
): Promise<{ rounds: number; matchups: number; games: number }> {
  const [matchupRounds, gameRounds] = await Promise.all([
    db
      .select({ round: teamMatchups.round, n: count() })
      .from(teamMatchups)
      .where(eq(teamMatchups.eventId, eventId))
      .groupBy(teamMatchups.round),
    db
      .select({ round: games.round, n: count() })
      .from(games)
      .where(eq(games.eventId, eventId))
      .groupBy(games.round),
  ]);
  const rounds = new Set([...matchupRounds, ...gameRounds].map((row) => row.round));
  const sum = (rows: { n: number }[]) => rows.reduce((total, row) => total + row.n, 0);
  return { rounds: rounds.size, matchups: sum(matchupRounds), games: sum(gameRounds) };
}
```

Run: `pnpm vitest run --project api src/repo`
Expected: PASS.

- [ ] **Step 5: Write the failing worker tests** (Review Focus 3)

Add to `apps/api/src/fetch-queue/worker.test.ts`:

```ts
describe('pairings jobs', () => {
  const BRACKET = 'EVTBRACKET01';

  async function catalogueOnly(eventId: string) {
    // In the catalogue but never synced: the round count comes from the event sync.
    await upsertEventSummaries(db, [await source.getEvent(eventId)]);
  }

  it('an event job syncs the event, then queues its rounds, which fetch the games', async () => {
    await catalogueOnly(BRACKET);
    await enqueueEventPairings(db, BRACKET, { rounds: null, priority: USER_WAITING_PRIORITY });
    const w = worker();

    expect(await w.tick()).toBe('fetched'); // the event job
    const rounds = await db
      .select({ round: fetchQueue.round, priority: fetchQueue.priority })
      .from(fetchQueue)
      .where(eq(fetchQueue.kind, 'pairings-round'));
    expect(rounds).toEqual([
      { round: 1, priority: 10 },
      { round: 2, priority: 10 },
      { round: 3, priority: 10 },
    ]);

    await drainQueue(w);
    const [event] = await db.select().from(events).where(eq(events.id, BRACKET));
    expect(event?.pairingsSyncedAt).toBeInstanceOf(Date);
    expect(await db.select().from(games).where(eq(games.eventId, BRACKET))).toHaveLength(14);
  });

  it('stores matchups only when neither endpoint has games', async () => {
    await upsertEventDetail(db, await source.getEvent(BRACKET));
    await enqueueEventPairings(db, BRACKET, { rounds: [1], priority: 0 });
    const noGames: TournamentSource = {
      ...delegate(source),
      getEventGames: () => Promise.resolve([]),
    };
    expect(await worker(noGames).tick()).toBe('fetched');
    expect(await storedPairingsSummary(db, BRACKET)).toEqual({ rounds: 1, matchups: 3, games: 0 });
  });

  it('backs off a failing round job like a list', async () => {
    await upsertEventDetail(db, await source.getEvent(BRACKET));
    await enqueueEventPairings(db, BRACKET, { rounds: [1], priority: 0 });
    const failing: TournamentSource = {
      ...delegate(source),
      getTeamMatchups: () => Promise.reject(new BcpUnavailableError('BCP down')),
    };
    expect(await worker(failing).tick()).toBe('retry');
    const [row] = await db.select().from(fetchQueue);
    expect(row).toMatchObject({ status: 'queued', attempts: 1, error: 'BCP down' });
  });
});
```

Here `delegate(source)` is a small helper at the top of the test file that returns a plain `TournamentSource` object forwarding every method to `source`. Add it if the file has none. `withGetList` from plan 3 can be rewritten on top of it:

```ts
function delegate(inner: TournamentSource): TournamentSource {
  return {
    listEvents: (range, cursor) => inner.listEvents(range, cursor),
    getEvent: (id) => inner.getEvent(id),
    getPlayers: (id) => inner.getPlayers(id),
    getTeams: (id) => inner.getTeams(id),
    getTeamMatchups: (id, round) => inner.getTeamMatchups(id, round),
    getGames: (id, round) => inner.getGames(id, round),
    getEventGames: (id, round) => inner.getEventGames(id, round),
    getList: (listId) => inner.getList(listId),
  };
}
```

(14 games = 6 + 6 + 2 across the fixture's three rounds.)

Import what these tests use that the file doesn't yet: `events`, `games` and `fetchQueue` from `../db/schema`; `upsertEventSummaries` and `upsertEventDetail` from `../repo/events`; `enqueueEventPairings` and `USER_WAITING_PRIORITY` from `../repo/fetch-queue`; `storedPairingsSummary` from `../repo/pairings`; `BcpUnavailableError` from `../errors`; and `drainQueue` from `../test/helpers`.

Run: `pnpm vitest run --project api src/fetch-queue`
Expected: FAIL (the worker only knows lists).

- [ ] **Step 6: Implement the worker kinds**

In `apps/api/src/fetch-queue/worker.ts`, dispatch on `claimed.kind` inside the existing `try`. The existing `catch` (pause on a rejected login, rate-limit pause, backoff, final failure) stays shared by all kinds. `NO_LIST` stays list-only.

```ts
    try {
      switch (claimed.kind) {
        case 'list':
          return log(await this.#fetchList(claimed));
        case 'event':
          return log(await this.#fetchEvent(claimed));
        case 'pairings-round':
          return log(await this.#fetchRound(claimed));
      }
    } catch (error) {
      …unchanged…
    }
```

```ts
  async #fetchList(job: ClaimedJob): Promise<TickOutcome> {
    const { db, source } = this.#options;
    if (job.playerId === null || job.listId === null) {
      await markJobFailed(db, job.id, 'List job without player or list', 'INTERNAL');
      return 'failed';
    }
    const list = await source.getList(job.listId);
    if (list === null) {
      await markJobFailed(db, job.id, 'No list on BCP', NO_LIST_CODE);
      return 'failed';
    }
    await saveArmyList(db, job.playerId, list);
    await markJobDone(db, job.id);
    return 'fetched';
  }

  /** Event detail, teams and players; with a pairings follow-up, then queues every round. */
  async #fetchEvent(job: ClaimedJob): Promise<TickOutcome> {
    const { db, source } = this.#options;
    const event = await syncEvent({ db, source }, job.eventId);
    await markJobDone(db, job.id);
    if (job.followUp === 'pairings') {
      const rounds = Array.from({ length: event.roundCount }, (_, index) => index + 1);
      await enqueueEventPairings(db, job.eventId, { rounds, priority: job.priority });
    }
    return 'fetched';
  }

  /** One round's team matchups and games; marks the event's pairings synced after the last. */
  async #fetchRound(job: ClaimedJob): Promise<TickOutcome> {
    const { db, source, logger } = this.#options;
    const event = await findEvent(db, job.eventId);
    if (!event || job.round === null) {
      await markJobFailed(db, job.id, 'Round job for an unknown event or round', 'NOT_FOUND');
      return 'failed';
    }
    await syncRoundPairings(
      { db, source, logger },
      { id: event.id, isTeamEvent: event.isTeamEvent },
      job.round,
    );
    await markJobDone(db, job.id);
    await markPairingsSyncedIfComplete(db, event.id, event.roundCount);
    return 'fetched';
  }
```

- Make `log` accept the outcome returned by those methods.
- Add `kind: claimed.kind`, and `round: claimed.round` when not null, to the logged fields.
- The `playerId` field is logged only when not null.
- The log message is `'Fetch queue job'`.

In `apps/api/src/sync/jobs.ts`, delete `syncPairings` and its `case 'pairings'`, and remove imports that are now unused. In `apps/api/src/sync/runner.test.ts`, delete the `pairings:` tests; the worker tests cover that behaviour now.

In `apps/api/src/repo/sync-runs.ts`, `latestEventSyncRuns` returns `{ event: latest('event') }`, and `latest` only takes `'event'`. Update its test.

Run: `pnpm vitest run --project api src/fetch-queue src/sync src/repo`
Expected: PASS.

- [ ] **Step 7: The queue service, route and event detail**

Create `apps/api/src/fetch-queue/queue-pairings.ts`:

```ts
import type { QueuePairingsResult } from '@bcp/shared';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { findEvent } from '../repo/events';
import { enqueueEventPairings } from '../repo/fetch-queue';
import type { FetchQueueWorker } from './worker';

/**
 * Queues an event's pairings for the background worker; never fetches anything itself. An event
 * that was never synced first gets an event job (its round count is unknown until then), which
 * queues the rounds when it is done.
 */
export async function queueEventPairings(
  deps: { db: Db; fetchQueue: FetchQueueWorker },
  eventId: string,
  priority: number,
): Promise<QueuePairingsResult> {
  const event = await findEvent(deps.db, eventId);
  if (!event) throw new NotFoundError(`Event ${eventId} is not in the local catalogue`);
  const rounds = event.lastSyncedAt
    ? Array.from({ length: event.roundCount }, (_, index) => index + 1)
    : null;
  const queued = await enqueueEventPairings(deps.db, eventId, { rounds, priority });
  return { ...queued, estimatedSeconds: await deps.fetchQueue.estimateSecondsFor(eventId) };
}
```

In `apps/api/src/routes/fetch-queue.ts`, add:

```ts
      .post('/events/:id/pairings/queue', requireJson, async (c) => {
        // The event page asks for these, so its jobs jump the queue.
        return c.json(await queueEventPairings(deps, c.req.param('id'), USER_WAITING_PRIORITY));
      })
```

In `apps/api/src/event-detail.ts`:

```ts
const [counts, syncs, queueSeconds, stored, jobs] = await Promise.all([
  countEventParticipants(db, eventId),
  latestEventSyncRuns(db, eventId),
  deps.fetchQueue.estimateSecondsFor(eventId),
  storedPairingsSummary(db, eventId),
  eventPairingsJobs(db, eventId),
]);
return {
  ...toEventListItem(row),
  stale: isEventStale(row, now),
  counts,
  syncs,
  queueSeconds,
  pairings: {
    syncedAt: row.pairingsSyncedAt?.toISOString() ?? null,
    roundCount: row.roundCount,
    roundsDone: stored.rounds,
    queued: jobs.queued,
    failed: jobs.failed,
    gamesAvailable: stored.matchups === 0 || stored.games > 0,
  },
};
```

- [ ] **Step 8: Route tests**

Add to `apps/api/src/routes/fetch-queue.test.ts` (it builds the app with `testFetchQueue`, see plan 3):

```ts
describe('pairings queue route', () => {
  const BRACKET = 'EVTBRACKET01';

  it('queues a never-synced event, and the worker fetches all its rounds', async () => {
    await upsertEventSummaries(db, [await sampleSource().getEvent(BRACKET)]);
    const queued = await json<QueuePairingsResult>(
      await send('POST', `/api/events/${BRACKET}/pairings/queue`, {}),
    );
    expect(queued).toEqual({ eventQueued: true, queuedRounds: 0, estimatedSeconds: 5 });

    await drainQueue(fetchQueue);
    const detail = await json<EventDetail>(await app.request(`/api/events/${BRACKET}`));
    expect(detail.pairings).toMatchObject({
      roundCount: 3,
      roundsDone: 3,
      queued: 0,
      failed: 0,
      gamesAvailable: true,
    });
    expect(detail.pairings.syncedAt).not.toBeNull();
  });

  it('queues each round of a synced event once', async () => {
    await send('POST', `/api/events/${EVENT}/lists/queue`, {}); // loads EVENT's players
    const first = await json<QueuePairingsResult>(
      await send('POST', `/api/events/${EVENT}/pairings/queue`, {}),
    );
    expect(first.queuedRounds).toBe(2);
    const again = await json<QueuePairingsResult>(
      await send('POST', `/api/events/${EVENT}/pairings/queue`, {}),
    );
    expect(again.queuedRounds).toBe(0);
    expect(
      (await json<EventDetail>(await app.request(`/api/events/${EVENT}`))).pairings.queued,
    ).toBe(2);
  });

  it('404s an unknown event and rejects the retired pairings sync kind', async () => {
    expect((await send('POST', '/api/events/NOPE/pairings/queue', {})).status).toBe(404);
    expect((await send('POST', '/api/sync', { kind: 'pairings', eventId: EVENT })).status).toBe(
      400,
    );
  });
});
```

(`EVENT` is `EVTTEAM0001`. If that file's `beforeEach` doesn't put the event in the catalogue, the lists-queue POST does it through `ensureEventSynced`. Any other way of getting the event synced is fine.)

In `apps/api/src/routes/event-routes.test.ts`, replace the uses of `{ kind: 'pairings' }` with the queue route plus `drainQueue`. Update the `EventDetail` expectations: `syncs` loses `pairings`, `listQueueSeconds` becomes `queueSeconds`, and `pairings` is added.

- [ ] **Step 9: Web compile fixes**

- `apps/web/src/test/sample-data.ts`: `anEventDetail` gets `syncs: { event: null }`, `queueSeconds: null` and `pairings: { syncedAt: null, roundCount: 2, roundsDone: 0, queued: 0, failed: 0, gamesAvailable: true }`. Queue state samples get `byKind` with all three kinds.
- `EventQueueLine.tsx` and `ListDrawer.tsx` (and their tests): `listQueueSeconds` → `queueSeconds`.
- `features/sync/follow-sync.test.ts`: the `kind: 'pairings'` request becomes `kind: 'event'`.
- Fix anything else the compiler reports.

- [ ] **Step 10: Run everything and commit**

Run: `pnpm check`
Expected: PASS.

Run: `pnpm e2e`
Expected: 1 passed.

```bash
git add -A
git commit -m "feat: queue events and pairing rounds through the fetch queue; retire the pairings sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Shared analysis: rounds, standings and team contribution

Pure functions with no I/O, tested with small inline data.

**Files:**

- Create: `packages/shared/src/analysis/inputs.ts`, `schemas.ts`, `rounds.ts`, `standings.ts`, `contribution.ts`, `index.ts`
- Create: `packages/shared/src/analysis/rounds.test.ts`, `standings.test.ts`, `contribution.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './analysis';`)

**Interfaces:**

- Consumes: `GameResultSchema`, `SideSchema` (`domain.ts`).
- Produces:
  - Input row types: `TeamRow`, `PlayerRow`, `MatchupRow`, `GameRow`, `EventAnalysisInput` (`{ teams; players; matchups; games }`).
  - Schemas and types: `OutcomeSchema`/`Outcome` (`win` | `loss` | `draw` | `bye`), `TeamRefSchema`, `PlayerRefSchema`, `GameViewSchema`, `MatchupViewSchema`, `RoundViewSchema`, `RoundsResponseSchema`/`RoundsResponse`, `RoundInfoSchema`, `TotalsSchema`/`Totals`, `StandingCellSchema`, `StandingRowSchema`, `StandingsResponseSchema`/`StandingsResponse`, `PlayerRoundSchema`, `TeamPlayerRowSchema`, `TeamDetailResponseSchema`/`TeamDetailResponse`.
  - Functions:
    - `computeBracketRounds(matchups): Set<number>`
    - `buildRounds(input): RoundsResponse`
    - `computeStandings(input): StandingsResponse`
    - `computeTeamContribution(input, teamId): TeamDetailResponse | null`

- [ ] **Step 1: Types and schemas**

`packages/shared/src/analysis/inputs.ts`:

```ts
import type { GameResult, Side } from '../domain';

/** Rows the analysis functions work on: what the database stores, keyed by BCP ids. */
export interface TeamRow {
  id: string;
  name: string;
  placing: number | null;
}

export interface PlayerRow {
  id: string;
  name: string;
  faction: string | null;
  teamId: string | null;
}

/** `teamBId` is null for a bye. */
export interface MatchupRow {
  id: string;
  round: number;
  tableNo: number | null;
  teamAId: string;
  teamBId: string | null;
  pointsA: number | null;
  pointsB: number | null;
}

/** `playerBId` is null for a bye. VP is null when BCP didn't serve it (bracket events). */
export interface GameRow {
  id: string;
  round: number;
  tableNo: number | null;
  teamMatchupId: string | null;
  playerAId: string;
  playerBId: string | null;
  gamePointsA: number | null;
  gamePointsB: number | null;
  vpA: number | null;
  vpB: number | null;
  firstTurn: Side | null;
  result: GameResult | null;
}

export interface EventAnalysisInput {
  teams: TeamRow[];
  players: PlayerRow[];
  matchups: MatchupRow[];
  games: GameRow[];
}
```

`packages/shared/src/analysis/schemas.ts`:

```ts
import { z } from 'zod';
import { GameResultSchema, SideSchema } from '../domain';

const nullableNumber = z.number().nullable();
const round = z.number().int().positive();

/** A result from one side's point of view. A bye counts as a win in totals. */
export const OutcomeSchema = z.enum(['win', 'loss', 'draw', 'bye']);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const TeamRefSchema = z.object({ id: z.string(), name: z.string() });
export type TeamRef = z.infer<typeof TeamRefSchema>;

export const PlayerRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  faction: z.string().nullable(),
  teamId: z.string().nullable(),
});
export type PlayerRef = z.infer<typeof PlayerRefSchema>;

export const GameViewSchema = z.object({
  id: z.string(),
  tableNo: z.number().int().nullable(),
  playerA: PlayerRefSchema,
  /** Null for a bye. */
  playerB: PlayerRefSchema.nullable(),
  gamePointsA: nullableNumber,
  gamePointsB: nullableNumber,
  vpA: nullableNumber,
  vpB: nullableNumber,
  firstTurn: SideSchema.nullable(),
  result: GameResultSchema.nullable(),
});
export type GameView = z.infer<typeof GameViewSchema>;

export const MatchupViewSchema = z.object({
  id: z.string(),
  tableNo: z.number().int().nullable(),
  teamA: TeamRefSchema,
  /** Null for a bye. */
  teamB: TeamRefSchema.nullable(),
  pointsA: nullableNumber,
  pointsB: nullableNumber,
  /** Team A's outcome; null until both scores are in. */
  outcomeA: OutcomeSchema.nullable(),
  games: z.array(GameViewSchema),
});
export type MatchupView = z.infer<typeof MatchupViewSchema>;

export const RoundViewSchema = z.object({
  round,
  bracket: z.boolean(),
  matchups: z.array(MatchupViewSchema),
  /** Games not under a stored team matchup (singles events). */
  games: z.array(GameViewSchema),
});
export type RoundView = z.infer<typeof RoundViewSchema>;

export const RoundsResponseSchema = z.object({
  /** False when team matchups are stored but BCP served no individual games. */
  gamesAvailable: z.boolean(),
  rounds: z.array(RoundViewSchema),
});
export type RoundsResponse = z.infer<typeof RoundsResponseSchema>;

export const RoundInfoSchema = z.object({ round, bracket: z.boolean() });
export type RoundInfo = z.infer<typeof RoundInfoSchema>;

/** W/L/D (byes count as wins) and summed points: team points for teams, game points for players. */
export const TotalsSchema = z.object({
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  points: z.number(),
});
export type Totals = z.infer<typeof TotalsSchema>;

export const StandingCellSchema = z.object({
  round,
  points: nullableNumber,
  outcome: OutcomeSchema.nullable(),
  opponent: TeamRefSchema.nullable(),
});
export type StandingCell = z.infer<typeof StandingCellSchema>;

export const StandingRowSchema = z.object({
  team: TeamRefSchema,
  placing: z.number().int().nullable(),
  /** One cell per entry of `rounds`; null when the team had no matchup that round. */
  perRound: z.array(StandingCellSchema.nullable()),
  totals: TotalsSchema,
});
export type StandingRow = z.infer<typeof StandingRowSchema>;

export const StandingsResponseSchema = z.object({
  rounds: z.array(RoundInfoSchema),
  teams: z.array(StandingRowSchema),
});
export type StandingsResponse = z.infer<typeof StandingsResponseSchema>;

export const PlayerRoundSchema = z.object({
  round,
  /** Null for a bye. */
  opponent: PlayerRefSchema.nullable(),
  outcome: OutcomeSchema.nullable(),
  gamePoints: nullableNumber,
  opponentGamePoints: nullableNumber,
  vp: nullableNumber,
  opponentVp: nullableNumber,
});
export type PlayerRound = z.infer<typeof PlayerRoundSchema>;

export const TeamPlayerRowSchema = z.object({
  player: PlayerRefSchema,
  /** One cell per entry of `rounds`; null when the player had no game that round. */
  perRound: z.array(PlayerRoundSchema.nullable()),
  totals: TotalsSchema,
});
export type TeamPlayerRow = z.infer<typeof TeamPlayerRowSchema>;

export const TeamDetailResponseSchema = z.object({
  team: TeamRefSchema.extend({ placing: z.number().int().nullable() }),
  rounds: z.array(RoundInfoSchema),
  players: z.array(TeamPlayerRowSchema),
  totals: TotalsSchema,
});
export type TeamDetailResponse = z.infer<typeof TeamDetailResponseSchema>;
```

- [ ] **Step 2: Write the failing tests** (Review Focus 4)

`packages/shared/src/analysis/standings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MatchupRow, TeamRow } from './inputs';
import { computeStandings } from './standings';

const teams: TeamRow[] = [
  { id: 'GREY', name: 'Grey Watch', placing: null },
  { id: 'JADE', name: 'Jade Court', placing: null },
  { id: 'BLUE', name: 'Blue Wardens', placing: 2 },
  { id: 'RED', name: 'Red Legion', placing: 1 },
];
const m = (
  id: string,
  round: number,
  a: string,
  b: string | null,
  pa: number | null,
  pb: number | null,
): MatchupRow => ({
  id,
  round,
  tableNo: 1,
  teamAId: a,
  teamBId: b,
  pointsA: pa,
  pointsB: pb,
});
const matchups = [
  m('r1a', 1, 'RED', 'BLUE', 30, 10),
  m('r1b', 1, 'JADE', 'GREY', 20, 20),
  m('r2a', 2, 'RED', 'JADE', 25, 15),
  m('r2b', 2, 'BLUE', null, 40, null), // bye; Grey Watch missing from round 2
  m('r3a', 3, 'RED', 'BLUE', 21, 19), // the final: 2 of round 1's 4 teams → bracket
];

describe('computeStandings', () => {
  const standings = computeStandings({ teams, players: [], matchups, games: [] });

  it('orders by placing, then total points, then name, and flags the bracket round', () => {
    expect(standings.teams.map((row) => row.team.name)).toEqual([
      'Red Legion',
      'Blue Wardens',
      'Jade Court',
      'Grey Watch',
    ]);
    expect(standings.rounds).toEqual([
      { round: 1, bracket: false },
      { round: 2, bracket: false },
      { round: 3, bracket: true },
    ]);
  });

  it('shows each round’s points, outcome and opponent; a bye counts as a win', () => {
    const blue = standings.teams.find((row) => row.team.id === 'BLUE');
    expect(blue?.perRound).toEqual([
      { round: 1, points: 10, outcome: 'loss', opponent: { id: 'RED', name: 'Red Legion' } },
      { round: 2, points: 40, outcome: 'bye', opponent: null },
      { round: 3, points: 19, outcome: 'loss', opponent: { id: 'RED', name: 'Red Legion' } },
    ]);
    expect(blue?.totals).toEqual({ wins: 1, losses: 2, draws: 0, points: 69 });
  });

  it('leaves a round empty when the team had no matchup, and counts draws', () => {
    const grey = standings.teams.find((row) => row.team.id === 'GREY');
    expect(grey?.perRound).toEqual([
      { round: 1, points: 20, outcome: 'draw', opponent: { id: 'JADE', name: 'Jade Court' } },
      null,
      null,
    ]);
    expect(grey?.totals).toEqual({ wins: 0, losses: 0, draws: 1, points: 20 });
  });

  it('has no outcome until both scores are in', () => {
    const pending = computeStandings({
      teams,
      players: [],
      matchups: [m('x', 1, 'RED', 'BLUE', null, null)],
      games: [],
    });
    expect(pending.teams[0]?.perRound[0]).toMatchObject({ points: null, outcome: null });
    expect(pending.teams[0]?.totals).toEqual({ wins: 0, losses: 0, draws: 0, points: 0 });
  });
});
```

`packages/shared/src/analysis/rounds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EventAnalysisInput, GameRow } from './inputs';
import { buildRounds, computeBracketRounds } from './rounds';

const g = (
  id: string,
  round: number,
  matchup: string | null,
  a: string,
  b: string | null,
  pa: number,
  pb: number | null,
): GameRow => ({
  id,
  round,
  tableNo: Number(id.slice(-1)),
  teamMatchupId: matchup,
  playerAId: a,
  playerBId: b,
  gamePointsA: pa,
  gamePointsB: pb,
  vpA: null,
  vpB: null,
  firstTurn: null,
  result: b === null ? 'a_win' : pa > (pb ?? 0) ? 'a_win' : pa === pb ? 'draw' : 'b_win',
});

const input: EventAnalysisInput = {
  teams: [
    { id: 'RED', name: 'Red Legion', placing: 1 },
    { id: 'BLUE', name: 'Blue Wardens', placing: 2 },
    { id: 'JADE', name: 'Jade Court', placing: 3 },
  ],
  players: [
    { id: 'R1', name: 'Rhea Stone', faction: 'Adepta Sororitas', teamId: 'RED' },
    { id: 'B1', name: 'Bea Moss', faction: 'Necrons', teamId: 'BLUE' },
    { id: 'J1', name: 'Jon Reed', faction: "T'au Empire", teamId: 'JADE' },
  ],
  matchups: [
    { id: 'M2', round: 1, tableNo: 2, teamAId: 'JADE', teamBId: null, pointsA: 20, pointsB: null },
    { id: 'M1', round: 1, tableNo: 1, teamAId: 'RED', teamBId: 'BLUE', pointsA: 20, pointsB: 0 },
  ],
  games: [g('G2', 1, 'M2', 'J1', null, 20, null), g('G1', 1, 'M1', 'R1', 'B1', 20, 0)],
};

describe('buildRounds', () => {
  it('lists team matchups by table with their games; a bye has no opponent', () => {
    const { rounds, gamesAvailable } = buildRounds(input);
    expect(gamesAvailable).toBe(true);
    expect(rounds).toHaveLength(1);
    const [first, second] = rounds[0]?.matchups ?? [];
    expect(first).toMatchObject({
      id: 'M1',
      teamA: { id: 'RED', name: 'Red Legion' },
      teamB: { id: 'BLUE', name: 'Blue Wardens' },
      outcomeA: 'win',
    });
    expect(first?.games[0]).toMatchObject({
      playerA: { name: 'Rhea Stone', faction: 'Adepta Sororitas' },
      playerB: { name: 'Bea Moss' },
      vpA: null,
    });
    expect(second).toMatchObject({ id: 'M2', teamB: null, outcomeA: 'bye' });
    expect(second?.games[0]?.playerB).toBeNull();
    expect(rounds[0]?.games).toEqual([]);
  });

  it('keeps games without a stored matchup (singles), and names unknown players', () => {
    const singles = buildRounds({
      ...input,
      matchups: [],
      games: [g('G9', 2, null, 'R1', 'X9', 5, 15)],
    });
    expect(singles.rounds[0]?.games[0]?.playerB).toEqual({
      id: 'X9',
      name: 'Unknown player',
      faction: null,
      teamId: null,
    });
  });

  it('says when BCP served matchups but no games', () => {
    expect(buildRounds({ ...input, games: [] }).gamesAvailable).toBe(false);
  });
});

describe('computeBracketRounds', () => {
  it('flags later rounds with at most half of round 1’s teams, never round 1', () => {
    const matchups = [
      { id: 'a', round: 1, tableNo: 1, teamAId: 'A', teamBId: 'B', pointsA: 1, pointsB: 0 },
      { id: 'b', round: 1, tableNo: 2, teamAId: 'C', teamBId: 'D', pointsA: 1, pointsB: 0 },
      { id: 'c', round: 2, tableNo: 1, teamAId: 'A', teamBId: 'C', pointsA: 1, pointsB: 0 },
      { id: 'd', round: 2, tableNo: 2, teamAId: 'B', teamBId: 'D', pointsA: 1, pointsB: 0 },
      { id: 'e', round: 3, tableNo: 1, teamAId: 'A', teamBId: 'B', pointsA: 1, pointsB: 0 },
    ];
    expect([...computeBracketRounds(matchups)]).toEqual([3]);
  });
});
```

`packages/shared/src/analysis/contribution.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeTeamContribution } from './contribution';
import type { EventAnalysisInput, GameRow } from './inputs';

const game = (
  id: string,
  round: number,
  a: string,
  b: string | null,
  pa: number,
  pb: number | null,
  result: GameRow['result'],
): GameRow => ({
  id,
  round,
  tableNo: 1,
  teamMatchupId: null,
  playerAId: a,
  playerBId: b,
  gamePointsA: pa,
  gamePointsB: pb,
  vpA: null,
  vpB: null,
  firstTurn: null,
  result,
});

const input: EventAnalysisInput = {
  teams: [{ id: 'RED', name: 'Red Legion', placing: 1 }],
  players: [
    { id: 'R1', name: 'Rhea Stone', faction: 'Adepta Sororitas', teamId: 'RED' },
    { id: 'R2', name: 'Rolf Hart', faction: 'Space Marines', teamId: 'RED' },
    { id: 'B1', name: 'Bea Moss', faction: 'Necrons', teamId: 'BLUE' },
    { id: 'B2', name: 'Bram Holt', faction: 'Aeldari', teamId: 'BLUE' },
    { id: 'J1', name: 'Jon Reed', faction: "T'au Empire", teamId: 'JADE' },
    { id: 'J2', name: 'Juno Frey', faction: 'Adepta Sororitas', teamId: 'JADE' },
  ],
  matchups: [],
  games: [
    game('g1', 1, 'R1', 'B1', 20, 0, 'a_win'),
    game('g2', 1, 'R2', 'B2', 10, 10, 'draw'),
    game('g3', 2, 'R1', 'J1', 15, 5, 'a_win'),
    game('g4', 2, 'J2', 'R2', 10, 10, 'draw'), // Rolf is side B
    game('g5', 3, 'R2', null, 20, null, 'a_win'), // a bye
  ],
};

describe('computeTeamContribution', () => {
  const detail = computeTeamContribution(input, 'RED');

  it('lists the team’s players by game points, with a line per round', () => {
    expect(detail?.team).toEqual({ id: 'RED', name: 'Red Legion', placing: 1 });
    expect(detail?.players.map((row) => row.player.name)).toEqual(['Rolf Hart', 'Rhea Stone']);
    const rolf = detail?.players[0];
    expect(rolf?.perRound).toEqual([
      {
        round: 1,
        opponent: { id: 'B2', name: 'Bram Holt', faction: 'Aeldari', teamId: 'BLUE' },
        outcome: 'draw',
        gamePoints: 10,
        opponentGamePoints: 10,
        vp: null,
        opponentVp: null,
      },
      {
        round: 2,
        opponent: { id: 'J2', name: 'Juno Frey', faction: 'Adepta Sororitas', teamId: 'JADE' },
        outcome: 'draw',
        gamePoints: 10,
        opponentGamePoints: 10,
        vp: null,
        opponentVp: null,
      },
      {
        round: 3,
        opponent: null,
        outcome: 'bye',
        gamePoints: 20,
        opponentGamePoints: null,
        vp: null,
        opponentVp: null,
      },
    ]);
    expect(rolf?.totals).toEqual({ wins: 1, losses: 0, draws: 2, points: 40 });
    expect(detail?.players[1]?.perRound[2]).toBeNull(); // Rhea had no round-3 game
  });

  it('sums the team’s totals', () => {
    expect(detail?.totals).toEqual({ wins: 3, losses: 0, draws: 2, points: 75 });
  });

  it('returns null for a team that isn’t in the event', () => {
    expect(computeTeamContribution(input, 'NOPE')).toBeNull();
  });
});
```

Run: `pnpm vitest run --project shared src/analysis`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`packages/shared/src/analysis/rounds.ts`:

```ts
import type { EventAnalysisInput, GameRow, MatchupRow, PlayerRow, TeamRow } from './inputs';
import type { GameView, Outcome, PlayerRef, RoundsResponse, TeamRef, Totals } from './schemas';

/**
 * Bracket rounds: after round 1, rounds whose matchups involve at most half of round 1's teams
 * (a knockout stage after the swiss rounds). Without round-1 matchups there are none.
 */
export function computeBracketRounds(matchups: MatchupRow[]): Set<number> {
  const teamsByRound = new Map<number, Set<string>>();
  for (const matchup of matchups) {
    const teams = teamsByRound.get(matchup.round) ?? new Set<string>();
    teams.add(matchup.teamAId);
    if (matchup.teamBId !== null) teams.add(matchup.teamBId);
    teamsByRound.set(matchup.round, teams);
  }
  const firstRound = teamsByRound.get(1)?.size ?? 0;
  const bracket = new Set<number>();
  for (const [round, teams] of teamsByRound) {
    if (round > 1 && firstRound > 0 && teams.size <= firstRound / 2) bracket.add(round);
  }
  return bracket;
}

/** One side's outcome from both sides' points; a missing opponent is a bye. */
export function outcomeOf(
  own: number | null,
  other: number | null,
  hasOpponent: boolean,
): Outcome | null {
  if (!hasOpponent) return 'bye';
  if (own === null || other === null) return null;
  if (own > other) return 'win';
  if (own < other) return 'loss';
  return 'draw';
}

/** W/L/D (a bye is a win) and summed points over some cells. */
export function tally(
  cells: ({ outcome: Outcome | null; points: number | null } | null)[],
): Totals {
  const totals: Totals = { wins: 0, losses: 0, draws: 0, points: 0 };
  for (const cell of cells) {
    if (!cell) continue;
    if (cell.outcome === 'win' || cell.outcome === 'bye') totals.wins += 1;
    if (cell.outcome === 'loss') totals.losses += 1;
    if (cell.outcome === 'draw') totals.draws += 1;
    totals.points += cell.points ?? 0;
  }
  return totals;
}

/** Distinct rounds of the given rows, ascending. */
export function roundsOf(rows: { round: number }[]): number[] {
  return [...new Set(rows.map((row) => row.round))].sort((a, b) => a - b);
}

export function teamRefOf(teams: Map<string, TeamRow>, id: string): TeamRef {
  return { id, name: teams.get(id)?.name ?? 'Unknown team' };
}

export function playerRefOf(players: Map<string, PlayerRow>, id: string): PlayerRef {
  const player = players.get(id);
  return player
    ? { id, name: player.name, faction: player.faction, teamId: player.teamId }
    : { id, name: 'Unknown player', faction: null, teamId: null };
}

export const byId = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((row) => [row.id, row]));

const tableKey = (row: { tableNo: number | null; id: string }) =>
  row.tableNo ?? Number.MAX_SAFE_INTEGER;
const byTable = (
  a: { tableNo: number | null; id: string },
  b: { tableNo: number | null; id: string },
) => tableKey(a) - tableKey(b) || a.id.localeCompare(b.id);

/** Every round's team matchups (by table) with their games, plus games under no matchup. */
export function buildRounds({
  teams,
  players,
  matchups,
  games,
}: EventAnalysisInput): RoundsResponse {
  const teamMap = byId(teams);
  const playerMap = byId(players);
  const bracket = computeBracketRounds(matchups);
  const gameView = (game: GameRow): GameView => ({
    id: game.id,
    tableNo: game.tableNo,
    playerA: playerRefOf(playerMap, game.playerAId),
    playerB: game.playerBId === null ? null : playerRefOf(playerMap, game.playerBId),
    gamePointsA: game.gamePointsA,
    gamePointsB: game.gamePointsB,
    vpA: game.vpA,
    vpB: game.vpB,
    firstTurn: game.firstTurn,
    result: game.result,
  });

  const rounds = roundsOf([...matchups, ...games]).map((round) => {
    const roundMatchups = matchups.filter((matchup) => matchup.round === round).sort(byTable);
    const matchupIds = new Set(roundMatchups.map((matchup) => matchup.id));
    const roundGames = games.filter((game) => game.round === round).sort(byTable);
    return {
      round,
      bracket: bracket.has(round),
      matchups: roundMatchups.map((matchup) => ({
        id: matchup.id,
        tableNo: matchup.tableNo,
        teamA: teamRefOf(teamMap, matchup.teamAId),
        teamB: matchup.teamBId === null ? null : teamRefOf(teamMap, matchup.teamBId),
        pointsA: matchup.pointsA,
        pointsB: matchup.pointsB,
        outcomeA: outcomeOf(matchup.pointsA, matchup.pointsB, matchup.teamBId !== null),
        games: roundGames.filter((game) => game.teamMatchupId === matchup.id).map(gameView),
      })),
      games: roundGames
        .filter((game) => game.teamMatchupId === null || !matchupIds.has(game.teamMatchupId))
        .map(gameView),
    };
  });

  return { gamesAvailable: matchups.length === 0 || games.length > 0, rounds };
}
```

`packages/shared/src/analysis/standings.ts`:

```ts
import type { EventAnalysisInput } from './inputs';
import { byId, computeBracketRounds, outcomeOf, roundsOf, tally, teamRefOf } from './rounds';
import type { StandingCell, StandingRow, StandingsResponse } from './schemas';

const placingKey = (row: StandingRow) => row.placing ?? Number.MAX_SAFE_INTEGER;

/**
 * Teams with their points and outcome per round, ordered by BCP placing, then total points, then
 * name. A bye counts as a win; a round without a matchup for the team is null.
 */
export function computeStandings({ teams, matchups }: EventAnalysisInput): StandingsResponse {
  const teamMap = byId(teams);
  const bracket = computeBracketRounds(matchups);
  const rounds = roundsOf(matchups);

  const rows = teams.map((team): StandingRow => {
    const perRound = rounds.map((round): StandingCell | null => {
      const matchup = matchups.find(
        (candidate) =>
          candidate.round === round &&
          (candidate.teamAId === team.id || candidate.teamBId === team.id),
      );
      if (!matchup) return null;
      const isA = matchup.teamAId === team.id;
      const own = isA ? matchup.pointsA : matchup.pointsB;
      const other = isA ? matchup.pointsB : matchup.pointsA;
      const opponentId = isA ? matchup.teamBId : matchup.teamAId;
      return {
        round,
        points: own,
        outcome: outcomeOf(own, other, opponentId !== null),
        opponent: opponentId === null ? null : teamRefOf(teamMap, opponentId),
      };
    });
    return {
      team: { id: team.id, name: team.name },
      placing: team.placing,
      perRound,
      totals: tally(perRound),
    };
  });

  rows.sort(
    (a, b) =>
      placingKey(a) - placingKey(b) ||
      b.totals.points - a.totals.points ||
      a.team.name.localeCompare(b.team.name),
  );
  return { rounds: rounds.map((round) => ({ round, bracket: bracket.has(round) })), teams: rows };
}
```

`packages/shared/src/analysis/contribution.ts`:

```ts
import type { EventAnalysisInput, GameRow } from './inputs';
import { byId, computeBracketRounds, playerRefOf, roundsOf, tally } from './rounds';
import type { Outcome, PlayerRound, TeamDetailResponse, TeamPlayerRow, Totals } from './schemas';

function outcomeFor(game: GameRow, isA: boolean): Outcome | null {
  if (game.playerBId === null) return 'bye';
  if (game.result === null) return null;
  if (game.result === 'draw') return 'draw';
  return (game.result === 'a_win') === isA ? 'win' : 'loss';
}

/**
 * A team's players, each with their game per round (opponent, outcome, game points, VP) and
 * totals, ordered by total game points; null when the team isn't in the input.
 */
export function computeTeamContribution(
  input: EventAnalysisInput,
  teamId: string,
): TeamDetailResponse | null {
  const team = input.teams.find((candidate) => candidate.id === teamId);
  if (!team) return null;
  const playerMap = byId(input.players);
  const bracket = computeBracketRounds(input.matchups);
  const rounds = roundsOf([...input.matchups, ...input.games]);

  const rows = input.players
    .filter((player) => player.teamId === teamId)
    .map((player): TeamPlayerRow => {
      const perRound = rounds.map((round): PlayerRound | null => {
        const game = input.games.find(
          (candidate) =>
            candidate.round === round &&
            (candidate.playerAId === player.id || candidate.playerBId === player.id),
        );
        if (!game) return null;
        const isA = game.playerAId === player.id;
        const opponentId = isA ? game.playerBId : game.playerAId;
        return {
          round,
          opponent: opponentId === null ? null : playerRefOf(playerMap, opponentId),
          outcome: outcomeFor(game, isA),
          gamePoints: isA ? game.gamePointsA : game.gamePointsB,
          opponentGamePoints: isA ? game.gamePointsB : game.gamePointsA,
          vp: isA ? game.vpA : game.vpB,
          opponentVp: isA ? game.vpB : game.vpA,
        };
      });
      return {
        player: playerRefOf(playerMap, player.id),
        perRound,
        totals: tally(
          perRound.map((cell) => cell && { outcome: cell.outcome, points: cell.gamePoints }),
        ),
      };
    })
    .sort(
      (a, b) => b.totals.points - a.totals.points || a.player.name.localeCompare(b.player.name),
    );

  const totals = rows.reduce<Totals>(
    (sum, row) => ({
      wins: sum.wins + row.totals.wins,
      losses: sum.losses + row.totals.losses,
      draws: sum.draws + row.totals.draws,
      points: sum.points + row.totals.points,
    }),
    { wins: 0, losses: 0, draws: 0, points: 0 },
  );

  return {
    team: { id: team.id, name: team.name, placing: team.placing },
    rounds: rounds.map((round) => ({ round, bracket: bracket.has(round) })),
    players: rows,
    totals,
  };
}
```

`packages/shared/src/analysis/index.ts`:

```ts
export * from './contribution';
export * from './inputs';
export * from './rounds';
export * from './schemas';
export * from './standings';
```

Add `export * from './analysis';` to `packages/shared/src/index.ts`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project shared src/analysis`
Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(shared): rounds, standings and team contribution analysis

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API: rounds, standings and team detail

**Files:**

- Create: `apps/api/src/repo/analysis.ts`, `apps/api/src/routes/analysis.ts`, `apps/api/src/routes/analysis.test.ts`
- Modify: `apps/api/src/app.ts` (mount the routes)

**Interfaces:**

- Consumes: `buildRounds`, `computeStandings`, `computeTeamContribution` and `EventAnalysisInput` (task 4); `requireEvent` (`routes/require-event.ts`); `syncEvent` and `syncRoundPairings` (task 1, in tests).
- Produces:
  - `loadEventAnalysis(db, eventId): Promise<EventAnalysisInput>`
  - `GET /api/events/:id/rounds` → `RoundsResponse`
  - `GET /api/events/:id/standings` → `StandingsResponse`
  - `GET /api/events/:id/teams/:teamId` → `TeamDetailResponse` (404 when the team isn't the event's)

- [ ] **Step 1: Write the failing route tests** (Review Focus 4)

`apps/api/src/routes/analysis.test.ts`:

```ts
import type { RoundsResponse, StandingsResponse, TeamDetailResponse } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { syncRoundPairings } from '../sync/round-pairings';
import { SyncRunner } from '../sync/runner';
import { sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

const EVENT = 'EVTBRACKET01';
let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApp>;

async function loadBracketEvent(source: TournamentSource = sampleSource()) {
  const event = await syncEvent({ db, source }, EVENT);
  for (let round = 1; round <= event.roundCount; round += 1) {
    await syncRoundPairings({ db, source, logger: silentLogger }, event, round);
  }
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const source = sampleSource();
  app = createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger }),
    fetchQueue: testFetchQueue(db, source),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures',
        state: 'fixtures',
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
  });
});

const get = async <T>(path: string) => {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as T };
};

describe('analysis routes', () => {
  it('standings: placing order, a bye as a win, a missing round empty, the final flagged as bracket', async () => {
    await loadBracketEvent();
    const { body } = await get<StandingsResponse>(`/api/events/${EVENT}/standings`);
    expect(body.rounds).toEqual([
      { round: 1, bracket: false },
      { round: 2, bracket: false },
      { round: 3, bracket: true },
    ]);
    expect(body.teams.map((row) => row.team.name)).toEqual([
      'Red Legion',
      'Blue Wardens',
      'Grey Watch',
      'Jade Court',
      'Gold Hosts',
    ]);
    const jade = body.teams.find((row) => row.team.id === 'TB-JADE');
    expect(jade?.perRound).toEqual([
      { round: 1, points: 40, outcome: 'bye', opponent: null },
      { round: 2, points: 15, outcome: 'loss', opponent: { id: 'TB-RED', name: 'Red Legion' } },
      null,
    ]);
    expect(jade?.totals).toEqual({ wins: 1, losses: 1, draws: 0, points: 55 });
  });

  it('rounds: matchups with their games; byes have no opponent and no VP', async () => {
    await loadBracketEvent();
    const { body } = await get<RoundsResponse>(`/api/events/${EVENT}/rounds`);
    expect(body.gamesAvailable).toBe(true);
    const bye = body.rounds[0]?.matchups.find((matchup) => matchup.id === 'TPB-R1-3');
    expect(bye).toMatchObject({ teamB: null, outcomeA: 'bye', pointsA: 40 });
    expect(bye?.games.map((game) => [game.playerA.name, game.playerB, game.vpA])).toEqual([
      ['Jon Reed', null, null],
      ['Juno Frey', null, null],
    ]);
  });

  it('team detail: players by game points with a line per round', async () => {
    await loadBracketEvent();
    const { body } = await get<TeamDetailResponse>(`/api/events/${EVENT}/teams/TB-RED`);
    expect(body.players.map((row) => [row.player.name, row.totals.points])).toEqual([
      ['Rhea Stone', 46],
      ['Rolf Hart', 30],
    ]);
    expect(body.totals).toEqual({ wins: 3, losses: 0, draws: 3, points: 76 });
    expect(body.players[0]?.perRound[0]).toMatchObject({
      opponent: { name: 'Bea Moss', faction: 'Necrons' },
      outcome: 'win',
      gamePoints: 20,
      vp: null,
    });
  });

  it('still shows rounds and standings when BCP served no individual games', async () => {
    const source = sampleSource();
    const noGames: TournamentSource = {
      listEvents: (range, cursor) => source.listEvents(range, cursor),
      getEvent: (id) => source.getEvent(id),
      getPlayers: (id) => source.getPlayers(id),
      getTeams: (id) => source.getTeams(id),
      getTeamMatchups: (id, round) => source.getTeamMatchups(id, round),
      getGames: () => Promise.resolve([]),
      getEventGames: () => Promise.resolve([]),
      getList: (listId) => source.getList(listId),
    };
    await loadBracketEvent(noGames);
    const rounds = await get<RoundsResponse>(`/api/events/${EVENT}/rounds`);
    expect(rounds.body.gamesAvailable).toBe(false);
    expect(rounds.body.rounds[0]?.matchups).toHaveLength(3);
    const standings = await get<StandingsResponse>(`/api/events/${EVENT}/standings`);
    expect(standings.body.teams).toHaveLength(5);
  });

  it('404s an unknown event and a team of another event', async () => {
    await loadBracketEvent();
    expect((await get(`/api/events/NOPE/rounds`)).status).toBe(404);
    expect((await get(`/api/events/${EVENT}/teams/TM-ALPHA`)).status).toBe(404);
  });

  it('gives empty rounds and standings before pairings are fetched', async () => {
    await syncEvent({ db, source: sampleSource() }, EVENT);
    expect((await get<RoundsResponse>(`/api/events/${EVENT}/rounds`)).body).toEqual({
      gamesAvailable: true,
      rounds: [],
    });
    expect((await get<StandingsResponse>(`/api/events/${EVENT}/standings`)).body.rounds).toEqual(
      [],
    );
  });
});
```

(The totals follow the fixture. Rhea: 20 + 15 + 11 = 46, three wins. Rolf: three draws of 10 = 30. Jade: bye 40 + 15. If a number disagrees, recheck the fixture rather than the code, and fix whichever is wrong.)

Run: `pnpm vitest run --project api src/routes/analysis.test.ts`
Expected: FAIL (404s: the routes don't exist).

- [ ] **Step 2: Implement**

`apps/api/src/repo/analysis.ts`:

```ts
import type { EventAnalysisInput } from '@bcp/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { games, players, teamMatchups, teams } from '../db/schema';

/** Everything the analysis functions need about one event, as plain rows. */
export async function loadEventAnalysis(db: Db, eventId: string): Promise<EventAnalysisInput> {
  const [teamRows, playerRows, matchupRows, gameRows] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name, placing: teams.placing })
      .from(teams)
      .where(eq(teams.eventId, eventId)),
    db
      .select({
        id: players.id,
        name: players.name,
        faction: players.faction,
        teamId: players.teamId,
      })
      .from(players)
      .where(eq(players.eventId, eventId)),
    db
      .select({
        id: teamMatchups.id,
        round: teamMatchups.round,
        tableNo: teamMatchups.tableNo,
        teamAId: teamMatchups.teamAId,
        teamBId: teamMatchups.teamBId,
        pointsA: teamMatchups.pointsA,
        pointsB: teamMatchups.pointsB,
      })
      .from(teamMatchups)
      .where(eq(teamMatchups.eventId, eventId)),
    db
      .select({
        id: games.id,
        round: games.round,
        tableNo: games.tableNo,
        teamMatchupId: games.teamMatchupId,
        playerAId: games.playerAId,
        playerBId: games.playerBId,
        gamePointsA: games.gamePointsA,
        gamePointsB: games.gamePointsB,
        vpA: games.vpA,
        vpB: games.vpB,
        firstTurn: games.firstTurn,
        result: games.result,
      })
      .from(games)
      .where(eq(games.eventId, eventId)),
  ]);
  return { teams: teamRows, players: playerRows, matchups: matchupRows, games: gameRows };
}
```

`apps/api/src/routes/analysis.ts`:

```ts
import { buildRounds, computeStandings, computeTeamContribution } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { loadEventAnalysis } from '../repo/analysis';
import { requireEvent } from './require-event';

/** Read-only analysis of an event's stored pairings; nothing here talks to BCP. */
export function analysisRoutes(deps: { db: Db }) {
  const load = async (eventId: string) => {
    await requireEvent(deps.db, eventId);
    return loadEventAnalysis(deps.db, eventId);
  };
  return new Hono()
    .get('/events/:id/rounds', async (c) => c.json(buildRounds(await load(c.req.param('id')))))
    .get('/events/:id/standings', async (c) =>
      c.json(computeStandings(await load(c.req.param('id')))),
    )
    .get('/events/:id/teams/:teamId', async (c) => {
      const { id, teamId } = c.req.param();
      const detail = computeTeamContribution(await load(id), teamId);
      if (!detail) throw new NotFoundError(`Team ${teamId} is not part of event ${id}`);
      return c.json(detail);
    });
}
```

In `apps/api/src/app.ts`, add `app.route('/api', analysisRoutes(deps));` next to the other route groups.

- [ ] **Step 3: Run the tests**

Run: `pnpm vitest run --project api src/routes/analysis.test.ts`
Expected: PASS.

- [ ] **Step 4: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(api): rounds, standings and team detail for an event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Web: Rounds and Standings tabs, and the team page

**Files:**

- Create in `apps/web/src/features/analysis/`: `analysis-queries.ts`, `format.ts` (+ `format.test.ts`), `PairingsGate.tsx` (+ test), `RoundsPanel.tsx` (+ test), `StandingsPanel.tsx` (+ test), `TeamPage.tsx` (+ test)
- Create: `apps/web/src/routes/events.$eventId_.teams.$teamId.tsx`
- Modify: `apps/web/src/features/event/EventPage.tsx` (+ test), `apps/web/src/features/event/event-queries.ts`, `apps/web/src/routes/events.$eventId.tsx`

**Interfaces:**

- Consumes:
  - `RoundsResponseSchema`, `StandingsResponseSchema`, `TeamDetailResponseSchema`, `QueuePairingsResultSchema` and `EventDetail.pairings`/`queueSeconds` (tasks 3–4);
  - the routes from task 5, and `POST /api/events/:id/pairings/queue` (task 3);
  - `retryFailed(eventId?)` and `fetchQueueQuery` (`features/fetch-queue/fetch-queue-queries.ts`, task 2);
  - `formatDuration` (`lib/format.ts`).
- Produces:
  - `EVENT_TABS` for team events: `players`, `rounds`, `standings`; singles: `players`, `rounds`. `tabsFor(event): EventTab[]`.
  - Queries: `roundsQuery(eventId, live)`, `standingsQuery(eventId, live)`, `teamQuery(eventId, teamId, live)`, all under the `['event', eventId, …]` key. Also `queuePairings(eventId)`.
  - Format helpers: `formatPoints(n)` (`–` for null), `outcomeLabel(outcome)` (`W`/`L`/`D`/`Bye`/`–`), `formatTotals(totals)` (`3-0-1`).
  - `<PairingsGate event>{children}</PairingsGate>`, `<RoundsPanel event />`, `<StandingsPanel event />`, `<TeamPage eventId teamId />`.
  - Route `/events/$eventId/teams/$teamId`, which is not nested in the event page.

- [ ] **Step 1: Queries and format helpers (with tests)**

`apps/web/src/features/analysis/analysis-queries.ts`:

```ts
import {
  QueuePairingsResultSchema,
  RoundsResponseSchema,
  StandingsResponseSchema,
  TeamDetailResponseSchema,
} from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../api/client';

const enc = encodeURIComponent;
/** While an event's pairings are being fetched, its analysis refreshes itself. */
const every = (live: boolean) => (live ? 5000 : false);

export const roundsQuery = (eventId: string, live: boolean) =>
  queryOptions({
    queryKey: ['event', eventId, 'rounds'],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}/rounds`, RoundsResponseSchema),
    refetchInterval: every(live),
  });

export const standingsQuery = (eventId: string, live: boolean) =>
  queryOptions({
    queryKey: ['event', eventId, 'standings'],
    queryFn: () => apiGet(`/api/events/${enc(eventId)}/standings`, StandingsResponseSchema),
    refetchInterval: every(live),
  });

export const teamQuery = (eventId: string, teamId: string, live: boolean) =>
  queryOptions({
    queryKey: ['event', eventId, 'team', teamId],
    queryFn: () =>
      apiGet(`/api/events/${enc(eventId)}/teams/${enc(teamId)}`, TeamDetailResponseSchema),
    refetchInterval: every(live),
  });

export const queuePairings = (eventId: string) =>
  apiPost(`/api/events/${enc(eventId)}/pairings/queue`, {}, QueuePairingsResultSchema);
```

`apps/web/src/features/analysis/format.ts`:

```ts
import type { Outcome, Totals } from '@bcp/shared';

/** A score or VP; BCP doesn't serve VP for bracket events, so missing values show as a dash. */
export const formatPoints = (value: number | null): string =>
  value === null ? '–' : String(value);

export function outcomeLabel(outcome: Outcome | null): string {
  switch (outcome) {
    case 'win':
      return 'W';
    case 'loss':
      return 'L';
    case 'draw':
      return 'D';
    case 'bye':
      return 'Bye';
    case null:
      return '–';
  }
}

/** "3-0-1": wins (byes included), losses, draws. */
export const formatTotals = (totals: Totals): string =>
  `${totals.wins}-${totals.losses}-${totals.draws}`;
```

`format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatPoints, formatTotals, outcomeLabel } from './format';

describe('analysis format', () => {
  it('shows missing points as a dash, never 0', () => {
    expect(formatPoints(null)).toBe('–');
    expect(formatPoints(0)).toBe('0');
  });
  it('labels outcomes and totals', () => {
    expect(['win', 'loss', 'draw', 'bye', null].map((o) => outcomeLabel(o as never))).toEqual([
      'W',
      'L',
      'D',
      'Bye',
      '–',
    ]);
    expect(formatTotals({ wins: 3, losses: 0, draws: 1, points: 70 })).toBe('3-0-1');
  });
});
```

In `apps/web/src/features/event/event-queries.ts`, `eventQuery` also polls while pairings are queued:

```ts
    refetchInterval: (query) => {
      const detail = query.state.data;
      return detail && (detail.counts.listsQueued > 0 || detail.pairings.queued > 0) ? 5000 : false;
    },
```

- [ ] **Step 2: Write the failing component tests** (Review Focus 1)

`PairingsGate.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { PairingsGate } from './PairingsGate';

const pairings = {
  syncedAt: null,
  roundCount: 3,
  roundsDone: 0,
  queued: 0,
  failed: 0,
  gamesAvailable: true,
};

describe('PairingsGate', () => {
  it('offers to fetch pairings when there are none, and queues them', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/events/EVT1/pairings/queue': {
        eventQueued: false,
        queuedRounds: 3,
        estimatedSeconds: 15,
      },
    });
    renderWithProviders(
      <PairingsGate event={anEventDetail({ pairings })}>
        <p>content</p>
      </PairingsGate>,
    );
    expect(screen.queryByText('content')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch pairings' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/events/EVT1/pairings/queue')).toBe(
        true,
      );
    });
  });

  it('shows progress while fetching, with the content fetched so far', () => {
    renderWithProviders(
      <PairingsGate
        event={anEventDetail({
          pairings: { ...pairings, roundsDone: 1, queued: 2 },
          queueSeconds: 10,
        })}
      >
        <p>content</p>
      </PairingsGate>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.getAttribute('aria-live') === 'polite' &&
          /Pairings · 1\/3 rounds · about 10 s/.test(el.textContent ?? ''),
      ),
    ).toBeInTheDocument();
  });

  it('offers Retry for failed rounds and says when games are unavailable', async () => {
    const fetchMock = stubFetchRoutes({ 'POST /api/fetch-queue/retry-failed': { requeued: 1 } });
    renderWithProviders(
      <PairingsGate
        event={anEventDetail({
          pairings: { ...pairings, roundsDone: 2, failed: 1, gamesAvailable: false },
        })}
      >
        <p>content</p>
      </PairingsGate>,
    );
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '1 round failed'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Individual games unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ eventId: 'EVT1' });
    });
  });
});
```

`RoundsPanel.test.tsx`:

```tsx
import type { RoundsResponse } from '@bcp/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { RoundsPanel } from './RoundsPanel';

const player = (id: string, name: string, faction: string) => ({ id, name, faction, teamId: null });
const rounds: RoundsResponse = {
  gamesAvailable: true,
  rounds: [
    {
      round: 1,
      bracket: false,
      matchups: [
        {
          id: 'M1',
          tableNo: 1,
          teamA: { id: 'RED', name: 'Red Legion' },
          teamB: { id: 'BLUE', name: 'Blue Wardens' },
          pointsA: 30,
          pointsB: 10,
          outcomeA: 'win',
          games: [
            {
              id: 'G1',
              tableNo: 1,
              playerA: player('R1', 'Rhea Stone', 'Adepta Sororitas'),
              playerB: player('B1', 'Bea Moss', 'Necrons'),
              gamePointsA: 20,
              gamePointsB: 0,
              vpA: null,
              vpB: null,
              firstTurn: null,
              result: 'a_win',
            },
          ],
        },
        {
          id: 'M2',
          tableNo: 2,
          teamA: { id: 'JADE', name: 'Jade Court' },
          teamB: null,
          pointsA: 40,
          pointsB: null,
          outcomeA: 'bye',
          games: [],
        },
      ],
      games: [],
    },
    { round: 2, bracket: true, matchups: [], games: [] },
  ],
};

describe('RoundsPanel', () => {
  it('lists a round’s matchups; expanding one shows its games with "–" for missing VP', async () => {
    stubFetchRoutes({ 'GET /api/events/EVT1/rounds': rounds });
    renderWithRouter(
      <RoundsPanel
        event={anEventDetail({
          pairings: {
            syncedAt: null,
            roundCount: 2,
            roundsDone: 2,
            queued: 0,
            failed: 0,
            gamesAvailable: true,
          },
        })}
      />,
    );
    const matchup = await screen.findByRole('button', {
      name: /Red Legion\s*30\s*–\s*10\s*Blue Wardens/,
    });
    expect(screen.getByText(/Jade Court/)).toBeInTheDocument();
    expect(screen.getByText('Bye')).toBeInTheDocument();
    fireEvent.click(matchup);
    expect(await screen.findByText('Rhea Stone')).toBeInTheDocument();
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(2); // VP A and B
    expect(screen.getByRole('radio', { name: 'Round 2 · Bracket' })).toBeInTheDocument();
  });
});
```

`StandingsPanel.test.tsx`:

```tsx
import type { StandingsResponse } from '@bcp/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { StandingsPanel } from './StandingsPanel';

const standings: StandingsResponse = {
  rounds: [
    { round: 1, bracket: false },
    { round: 2, bracket: true },
  ],
  teams: [
    {
      team: { id: 'RED', name: 'Red Legion' },
      placing: 1,
      perRound: [
        { round: 1, points: 30, outcome: 'win', opponent: { id: 'BLUE', name: 'Blue Wardens' } },
        { round: 2, points: 40, outcome: 'bye', opponent: null },
      ],
      totals: { wins: 2, losses: 0, draws: 0, points: 70 },
    },
    {
      team: { id: 'GREY', name: 'Grey Watch' },
      placing: null,
      perRound: [
        { round: 1, points: 10, outcome: 'loss', opponent: { id: 'RED', name: 'Red Legion' } },
        null,
      ],
      totals: { wins: 0, losses: 1, draws: 0, points: 10 },
    },
  ],
};

describe('StandingsPanel', () => {
  it('shows teams with a cell per round, a bye, an empty round and links to each team', async () => {
    stubFetchRoutes({ 'GET /api/events/EVT1/standings': standings });
    renderWithRouter(
      <StandingsPanel
        event={anEventDetail({
          pairings: {
            syncedAt: null,
            roundCount: 2,
            roundsDone: 2,
            queued: 0,
            failed: 0,
            gamesAvailable: true,
          },
        })}
      />,
    );
    const red = await screen.findByRole('link', { name: 'Red Legion' });
    expect(red.getAttribute('href')).toBe('/events/EVT1/teams/RED');
    expect(screen.getByRole('columnheader', { name: 'R2 · Bracket' })).toBeInTheDocument();
    expect(screen.getByText('Bye 40')).toBeInTheDocument();
    expect(screen.getByText('W 30')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2); // Grey Watch's placing and its empty round
    expect(screen.getByText('2-0-0')).toBeInTheDocument();
  });
});
```

`TeamPage.test.tsx`:

```tsx
import type { TeamDetailResponse } from '@bcp/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { TeamPage } from './TeamPage';

const detail: TeamDetailResponse = {
  team: { id: 'RED', name: 'Red Legion', placing: 1 },
  rounds: [{ round: 1, bracket: false }],
  players: [
    {
      player: { id: 'R1', name: 'Rhea Stone', faction: 'Adepta Sororitas', teamId: 'RED' },
      perRound: [
        {
          round: 1,
          opponent: { id: 'B1', name: 'Bea Moss', faction: 'Necrons', teamId: 'BLUE' },
          outcome: 'win',
          gamePoints: 20,
          opponentGamePoints: 0,
          vp: null,
          opponentVp: null,
        },
      ],
      totals: { wins: 1, losses: 0, draws: 0, points: 20 },
    },
  ],
  totals: { wins: 1, losses: 0, draws: 0, points: 20 },
};

describe('TeamPage', () => {
  it('shows the team, its players and each round’s game', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/teams/RED': detail,
      'GET /api/events/EVT1': anEventDetail(),
    });
    renderWithRouter(<TeamPage eventId="EVT1" teamId="RED" />);
    expect(await screen.findByRole('heading', { name: 'Red Legion' })).toBeInTheDocument();
    expect(screen.getByText('Rhea Stone')).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'W 20–0'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bea Moss/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sample Team Open/ }).getAttribute('href')).toBe(
      '/events/EVT1?tab=standings',
    );
  });
});
```

In `EventPage.test.tsx`, add:

```tsx
it('shows Rounds and Standings tabs on team events, only Rounds on singles', async () => {
  stubFetchRoutes({
    'GET /api/events/EVT1/players': { items: [] },
    'GET /api/events/EVT1': anEventDetail(),
  });
  const { unmount } = renderWithProviders(<EventPage eventId="EVT1" {...tabProps} />);
  expect(await screen.findByRole('tab', { name: 'Standings' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Rounds' })).toBeInTheDocument();
  unmount();

  stubFetchRoutes({
    'GET /api/events/EVT1/players': { items: [] },
    'GET /api/events/EVT1': anEventDetail({ isTeamEvent: false }),
  });
  renderWithProviders(<EventPage eventId="EVT1" {...tabProps} />);
  expect(await screen.findByRole('tab', { name: 'Rounds' })).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'Standings' })).toBeNull();
});
```

(`anEventDetail()` defaults to a team event; check `sample-data.ts`. Components with links need `renderWithRouter`. If `EventPage` renders a `Link` via its new panels, switch its tests to `renderWithRouter` and `findBy…`.)

Run: `pnpm vitest run --project web src/features/analysis src/features/event/EventPage.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the gate and panels**

`apps/web/src/features/analysis/PairingsGate.tsx`:

```tsx
import type { EventDetail } from '@bcp/shared';
import { Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Panel } from '../../components/Panel';
import { formatDuration } from '../../lib/format';
import { fetchQueueQuery, retryFailed } from '../fetch-queue/fetch-queue-queries';
import { queuePairings } from './analysis-queries';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Wraps an analysis tab: offers to fetch pairings when there are none, shows progress while the
 * fetch queue works through the rounds, and failures with Retry. Renders the tab once any round
 * is stored.
 */
export function PairingsGate({ event, children }: { event: EventDetail; children: ReactNode }) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['event', event.bcpId] }),
      queryClient.invalidateQueries({ queryKey: fetchQueueQuery.queryKey }),
    ]);
  const queue = useMutation({
    mutationFn: () => queuePairings(event.bcpId),
    onSuccess: refresh,
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Pairings', message: error.message });
    },
  });
  const retry = useMutation({ mutationFn: () => retryFailed(event.bcpId), onSuccess: refresh });
  const { roundsDone, roundCount, queued, failed, gamesAvailable } = event.pairings;
  const hasData = roundsDone > 0;
  const fetching = queued > 0;

  return (
    <Stack gap="md">
      {fetching && (
        <Text size="sm" c="dimmed" aria-live="polite">
          Pairings · <span className="numeric">{roundsDone}</span>/
          <span className="numeric">{roundCount}</span> rounds
          {event.queueSeconds !== null && (
            <>
              {' '}
              · about <span className="numeric">{formatDuration(event.queueSeconds)}</span>
            </>
          )}
        </Text>
      )}
      {failed > 0 && !fetching && (
        <Group gap="sm">
          <Text size="sm" c="red">
            <span className="numeric">{failed}</span> {plural(failed, 'round', 'rounds')} failed
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            loading={retry.isPending}
            onClick={() => {
              retry.mutate();
            }}
          >
            Retry
          </Button>
          {retry.error && (
            <Text size="sm" c="red">
              {retry.error.message}
            </Text>
          )}
        </Group>
      )}
      {hasData && !gamesAvailable && (
        <Text size="sm" c="yellow">
          Individual games unavailable for this event: BCP only has the team results.
        </Text>
      )}
      {hasData ? (
        <>
          {children}
          {!fetching && (
            <Group>
              <Button
                size="xs"
                variant="subtle"
                loading={queue.isPending}
                onClick={() => {
                  queue.mutate();
                }}
              >
                Refresh pairings
              </Button>
            </Group>
          )}
        </>
      ) : fetching ? (
        <Skeleton height={160} />
      ) : (
        <Panel title="No pairings yet">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              Pairings and results are fetched from BCP in the background, one round every few
              seconds.
            </Text>
            <Button
              loading={queue.isPending}
              onClick={() => {
                queue.mutate();
              }}
            >
              Fetch pairings
            </Button>
          </Stack>
        </Panel>
      )}
    </Stack>
  );
}
```

`apps/web/src/features/analysis/RoundsPanel.tsx`: a `SegmentedControl` of rounds, then the selected round. Team events show an `Accordion` of matchups (keyboard accessible), each panel holding a games table. Singles show the games table directly.

```tsx
import type { EventDetail, GameView, MatchupView } from '@bcp/shared';
import { Accordion, Group, SegmentedControl, Skeleton, Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { roundsQuery } from './analysis-queries';
import { formatPoints, outcomeLabel } from './format';

function GamesTable({ games }: { games: GameView[] }) {
  if (games.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No individual games for this matchup.
      </Text>
    );
  }
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Table</Table.Th>
            <Table.Th>Player</Table.Th>
            <Table.Th ta="right">GP</Table.Th>
            <Table.Th ta="right">VP</Table.Th>
            <Table.Th ta="right">VP</Table.Th>
            <Table.Th ta="right">GP</Table.Th>
            <Table.Th>Opponent</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {games.map((game) => (
            <Table.Tr key={game.id}>
              <Table.Td className="numeric">{game.tableNo ?? '–'}</Table.Td>
              <Table.Td>
                <Text size="sm">{game.playerA.name}</Text>
                <Text size="xs" c="dimmed">
                  {game.playerA.faction ?? 'Unknown faction'}
                  {game.firstTurn === 'a' && ' · went first'}
                </Text>
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.gamePointsA)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.vpA)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.vpB)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.gamePointsB)}
              </Table.Td>
              <Table.Td>
                {game.playerB ? (
                  <>
                    <Text size="sm">{game.playerB.name}</Text>
                    <Text size="xs" c="dimmed">
                      {game.playerB.faction ?? 'Unknown faction'}
                      {game.firstTurn === 'b' && ' · went first'}
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    Bye
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function MatchupControl({ matchup }: { matchup: MatchupView }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Text size="xs" c="dimmed" className="numeric" w={32}>
        T{matchup.tableNo ?? '–'}
      </Text>
      <Text size="sm">{matchup.teamA.name}</Text>
      {matchup.teamB ? (
        <>
          <Text size="sm" className="numeric">
            {formatPoints(matchup.pointsA)} – {formatPoints(matchup.pointsB)}
          </Text>
          <Text size="sm">{matchup.teamB.name}</Text>
        </>
      ) : (
        <Text size="sm" c="dimmed">
          {outcomeLabel('bye')} <span className="numeric">{formatPoints(matchup.pointsA)}</span>
        </Text>
      )}
    </Group>
  );
}

export function RoundsPanel({ event }: { event: EventDetail }) {
  const rounds = useQuery(roundsQuery(event.bcpId, event.pairings.queued > 0));
  const [selected, setSelected] = useState<string | null>(null);

  if (rounds.isPending) return <Skeleton height={200} />;
  if (rounds.error)
    return <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />;
  const all = rounds.data.rounds;
  if (all.length === 0) return <Text c="dimmed">No rounds stored yet.</Text>;
  const current = all.find((round) => String(round.round) === selected) ?? all[0];
  if (!current) return null;

  return (
    <Stack gap="md">
      <SegmentedControl
        aria-label="Round"
        value={String(current.round)}
        onChange={setSelected}
        data={all.map((round) => ({
          value: String(round.round),
          label: round.bracket ? `Round ${round.round} · Bracket` : `Round ${round.round}`,
        }))}
      />
      {current.matchups.length > 0 && (
        <Panel p={0}>
          <Accordion multiple chevronPosition="left">
            {current.matchups.map((matchup) => (
              <Accordion.Item key={matchup.id} value={matchup.id}>
                <Accordion.Control>
                  <MatchupControl matchup={matchup} />
                </Accordion.Control>
                <Accordion.Panel>
                  <GamesTable games={matchup.games} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Panel>
      )}
      {current.games.length > 0 && (
        <Panel>
          <GamesTable games={current.games} />
        </Panel>
      )}
    </Stack>
  );
}
```

(If Mantine's `SegmentedControl` doesn't expose options with role `radio` in jsdom, adjust the test to query the label text instead, and note it in the report.)

`apps/web/src/features/analysis/StandingsPanel.tsx`:

```tsx
import type { EventDetail, StandingCell } from '@bcp/shared';
import { Anchor, Skeleton, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { standingsQuery } from './analysis-queries';
import { formatPoints, formatTotals, outcomeLabel } from './format';

function Cell({ cell }: { cell: StandingCell | null }) {
  if (!cell) return <Text c="dimmed">—</Text>;
  return (
    <Text size="sm" className="numeric" title={cell.opponent ? `vs ${cell.opponent.name}` : 'Bye'}>
      {outcomeLabel(cell.outcome)} {formatPoints(cell.points)}
    </Text>
  );
}

export function StandingsPanel({ event }: { event: EventDetail }) {
  const standings = useQuery(standingsQuery(event.bcpId, event.pairings.queued > 0));
  if (standings.isPending) return <Skeleton height={200} />;
  if (standings.error) {
    return <ErrorState error={standings.error} onRetry={() => void standings.refetch()} />;
  }
  const { rounds, teams } = standings.data;
  if (teams.length === 0) return <Text c="dimmed">No teams stored yet.</Text>;

  return (
    <Panel p={0}>
      <Table.ScrollContainer minWidth={360 + rounds.length * 80}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th ta="right">#</Table.Th>
              <Table.Th>Team</Table.Th>
              {rounds.map((round) => (
                <Table.Th key={round.round}>
                  {round.bracket ? `R${round.round} · Bracket` : `R${round.round}`}
                </Table.Th>
              ))}
              <Table.Th ta="right">W-L-D</Table.Th>
              <Table.Th ta="right">Points</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {teams.map((row) => (
              <Table.Tr key={row.team.id}>
                <Table.Td ta="right" className="numeric">
                  {row.placing ?? '—'}
                </Table.Td>
                <Table.Td>
                  <Anchor
                    component={Link}
                    to="/events/$eventId/teams/$teamId"
                    params={{ eventId: event.bcpId, teamId: row.team.id }}
                  >
                    {row.team.name}
                  </Anchor>
                </Table.Td>
                {row.perRound.map((cell, index) => (
                  <Table.Td key={rounds[index]?.round ?? index}>
                    <Cell cell={cell} />
                  </Table.Td>
                ))}
                <Table.Td ta="right" className="numeric">
                  {formatTotals(row.totals)}
                </Table.Td>
                <Table.Td ta="right" className="numeric">
                  {row.totals.points}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Panel>
  );
}
```

(`Link` with typed `to`/`params` needs the route from step 4 to exist in the generated route tree. Run the web dev build or the TanStack router generator (the Vite plugin generates `routeTree.gen.ts`), or type-check after step 4.)

- [ ] **Step 4: The team page and route**

`apps/web/src/routes/events.$eventId_.teams.$teamId.tsx`. The trailing `_` keeps it out of the event page's layout:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { TeamPage } from '../features/analysis/TeamPage';

export const Route = createFileRoute('/events/$eventId_/teams/$teamId')({
  component: TeamRoute,
});

function TeamRoute() {
  const { eventId, teamId } = Route.useParams();
  return <TeamPage key={`${eventId}/${teamId}`} eventId={eventId} teamId={teamId} />;
}
```

(The generated route id includes the `_`; the URL path is `/events/$eventId/teams/$teamId`. Check `routeTree.gen.ts` after generating, and use exactly what `createFileRoute` expects there.)

`apps/web/src/features/analysis/TeamPage.tsx`:

```tsx
import type { PlayerRound } from '@bcp/shared';
import { Anchor, Group, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { eventQuery } from '../event/event-queries';
import { teamQuery } from './analysis-queries';
import { formatPoints, formatTotals, outcomeLabel } from './format';

function RoundCell({ cell }: { cell: PlayerRound | null }) {
  if (!cell) return <Text c="dimmed">—</Text>;
  return (
    <Stack gap={0}>
      <Text size="sm">
        {outcomeLabel(cell.outcome)}{' '}
        <span className="numeric">
          {formatPoints(cell.gamePoints)}–{formatPoints(cell.opponentGamePoints)}
        </span>
      </Text>
      <Text size="xs" c="dimmed">
        {cell.opponent
          ? `${cell.opponent.name} (${cell.opponent.faction ?? 'unknown faction'})`
          : 'Bye'}
      </Text>
    </Stack>
  );
}

export function TeamPage({ eventId, teamId }: { eventId: string; teamId: string }) {
  const event = useQuery(eventQuery(eventId));
  const live = (event.data?.pairings.queued ?? 0) > 0;
  const team = useQuery(teamQuery(eventId, teamId, live));

  if (team.isPending) return <Skeleton height={240} />;
  if (team.error) return <ErrorState error={team.error} onRetry={() => void team.refetch()} />;
  const { rounds, players, totals } = team.data;

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Anchor
          component={Link}
          to="/events/$eventId"
          params={{ eventId }}
          search={{ tab: 'standings' }}
          size="sm"
        >
          ← {event.data?.name ?? 'Event'}
        </Anchor>
        <Title order={2}>{team.data.team.name}</Title>
        <Group gap="md">
          <Text size="sm" c="dimmed">
            Placing <span className="numeric">{team.data.team.placing ?? '—'}</span>
          </Text>
          <Text size="sm" c="dimmed">
            <span className="numeric">{formatTotals(totals)}</span> ·{' '}
            <span className="numeric">{totals.points}</span> game points
          </Text>
        </Group>
      </Stack>
      <Panel p={0}>
        <Table.ScrollContainer minWidth={320 + rounds.length * 150}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Player</Table.Th>
                {rounds.map((round) => (
                  <Table.Th key={round.round}>
                    {round.bracket ? `R${round.round} · Bracket` : `R${round.round}`}
                  </Table.Th>
                ))}
                <Table.Th ta="right">W-L-D</Table.Th>
                <Table.Th ta="right">GP</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {players.map((row) => (
                <Table.Tr key={row.player.id}>
                  <Table.Td>
                    <Text size="sm">{row.player.name}</Text>
                    <Text size="xs" c="dimmed">
                      {row.player.faction ?? 'Unknown faction'}
                    </Text>
                  </Table.Td>
                  {row.perRound.map((cell, index) => (
                    <Table.Td key={rounds[index]?.round ?? index}>
                      <RoundCell cell={cell} />
                    </Table.Td>
                  ))}
                  <Table.Td ta="right" className="numeric">
                    {formatTotals(row.totals)}
                  </Table.Td>
                  <Table.Td ta="right" className="numeric">
                    {row.totals.points}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Panel>
    </Stack>
  );
}
```

- [ ] **Step 5: Event page tabs**

In `apps/web/src/features/event/EventPage.tsx`:

```tsx
/** The event page's tabs, in order; the selected one lives in the URL (`?tab=`). */
export const EVENT_TABS = [
  { value: 'players', label: 'Players & lists' },
  { value: 'rounds', label: 'Rounds' },
  { value: 'standings', label: 'Standings' },
] as const;
export type EventTab = (typeof EVENT_TABS)[number]['value'];

/** Standings only make sense for team events. */
export const tabsFor = (event: { isTeamEvent: boolean }) =>
  EVENT_TABS.filter((tab) => tab.value !== 'standings' || event.isTeamEvent);
```

- Render `tabsFor(detail)` in the `Tabs.List`.
- If the URL asks for `standings` on a singles event, show `players`: `const activeTab = tabsFor(detail).some((t) => t.value === tab) ? tab : 'players';`.
- Add the panels:

```tsx
<Tabs.Panel value="rounds" pt="md">
  <PairingsGate event={detail}>
    <RoundsPanel event={detail} />
  </PairingsGate>
</Tabs.Panel>;
{
  detail.isTeamEvent && (
    <Tabs.Panel value="standings" pt="md">
      <PairingsGate event={detail}>
        <StandingsPanel event={detail} />
      </PairingsGate>
    </Tabs.Panel>
  );
}
```

Remove the stale comment "Plan 3 adds the Rounds, Standings and Matchups tabs…". The route's `validateSearch` already derives from `EVENT_TABS`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run --project web`
Expected: PASS.

- [ ] **Step 7: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(web): rounds and standings tabs, and a team page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Players grouped by team, fetch-queue wording, e2e and README

**Files:**

- Modify (API/shared): `packages/shared/src/api.ts` (`EventPlayer.teamId`, `teamPlacing`), `apps/api/src/repo/participants.ts` (+ test)
- Modify (web): `apps/web/src/features/event/players-filter.ts` (+ test), `PlayersPanel.tsx` (+ test), `EventPage.tsx`, `apps/web/src/routes/events.$eventId.tsx`, `apps/web/src/test/sample-data.ts`, `apps/web/src/features/fetch-queue/QueueIndicator.tsx`, `QueueControls.tsx`, `FetchQueueCard.tsx` (+ tests)
- Create: `e2e/team-analysis.spec.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: everything above.
- Produces:
  - `EventPlayer.teamId: string | null` and `EventPlayer.teamPlacing: number | null`.
  - `groupPlayersByTeam(players: EventPlayer[]): PlayerGroup[]`, where `PlayerGroup = { teamId: string | null; teamName: string; teamPlacing: number | null; players: EventPlayer[] }`. Groups are ordered by team placing (nulls last), then name; players without a team come last, under "No team".
  - The event route's search gets `group: 'team' | 'none'`, default `'team'`.
  - `PlayersPanel` props gain `groupByTeam: boolean` and `onGroupByTeamChange(next: boolean)`.

- [ ] **Step 1: Team fields on players (API)**

In `packages/shared/src/api.ts`'s `EventPlayerSchema`, next to `teamName`, add `teamId: z.string().nullable()` and `/** The team's BCP placing, for ordering teams. */ teamPlacing: z.number().int().nullable()`.

In `apps/api/src/repo/participants.ts`'s `listEventPlayers`, select `teamPlacing: teams.placing` too, and map `teamId: player.teamId` and `teamPlacing`. Add a test to `participants.test.ts`:

```ts
it('lists each player’s team id and placing', async () => {
  // Uses the file's seeded EVTTEAM0001 (teams and players loaded).
  const ada = (await listEventPlayers(db, 'EVTTEAM0001')).find((p) => p.bcpId === 'PL-ADA');
  expect(ada).toMatchObject({ teamId: 'TM-ALPHA', teamName: 'Alpha Squad', teamPlacing: 2 });
});
```

(If `participants.test.ts` doesn't seed teams, seed them with `replaceEventTeams(db, EVENT, await sampleSource().getTeams(EVENT))` in this test.) Add `teamId: 'TM-ALPHA', teamPlacing: 2` to `aPlayer` in `apps/web/src/test/sample-data.ts`, and fix any other compile errors.

- [ ] **Step 2: Grouping helper (failing test first)**

Add to `apps/web/src/features/event/players-filter.test.ts`:

```ts
describe('groupPlayersByTeam', () => {
  it('groups by team in placing order, with teamless players last', () => {
    const groups = groupPlayersByTeam([
      aPlayer({ bcpId: 'A', teamId: 'T2', teamName: 'Bravo', teamPlacing: 2 }),
      aPlayer({ bcpId: 'B', teamId: null, teamName: null, teamPlacing: null }),
      aPlayer({ bcpId: 'C', teamId: 'T1', teamName: 'Alpha', teamPlacing: 1 }),
      aPlayer({ bcpId: 'D', teamId: 'T2', teamName: 'Bravo', teamPlacing: 2 }),
      aPlayer({ bcpId: 'E', teamId: 'T3', teamName: 'Charlie', teamPlacing: null }),
    ]);
    expect(groups.map((g) => [g.teamName, g.players.map((p) => p.bcpId)])).toEqual([
      ['Alpha', ['C']],
      ['Bravo', ['A', 'D']],
      ['Charlie', ['E']],
      ['No team', ['B']],
    ]);
  });
});
```

Implement in `players-filter.ts`:

```ts
export interface PlayerGroup {
  teamId: string | null;
  teamName: string;
  teamPlacing: number | null;
  players: EventPlayer[];
}

/**
 * Players grouped by team, teams in BCP placing order (unplaced teams after, by name), players
 * without a team last. Player order within a group is kept.
 */
export function groupPlayersByTeam(players: EventPlayer[]): PlayerGroup[] {
  const groups = new Map<string | null, PlayerGroup>();
  for (const player of players) {
    const group = groups.get(player.teamId) ?? {
      teamId: player.teamId,
      teamName: player.teamId === null ? 'No team' : (player.teamName ?? 'Unknown team'),
      teamPlacing: player.teamPlacing,
      players: [],
    };
    group.players.push(player);
    groups.set(player.teamId, group);
  }
  const rank = (group: PlayerGroup) =>
    group.teamId === null ? 2 : group.teamPlacing === null ? 1 : 0;
  return [...groups.values()].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.teamPlacing ?? 0) - (b.teamPlacing ?? 0) ||
      a.teamName.localeCompare(b.teamName),
  );
}
```

- [ ] **Step 3: Grouped players panel (failing test first)**

Add to `PlayersPanel.test.tsx` (keep its local `matchMedia` stub):

```tsx
it('groups a team event’s players by team, collapsibly, and can switch grouping off', async () => {
  const onGroupByTeamChange = vi.fn();
  stubFetchRoutes({
    'GET /api/events/EVT1/players': {
      items: [
        aPlayer({
          bcpId: 'P1',
          name: 'Ada Archer',
          teamId: 'TM-ALPHA',
          teamName: 'Alpha Squad',
          teamPlacing: 2,
        }),
        aPlayer({
          bcpId: 'P2',
          name: 'Cara Cole',
          teamId: 'TM-CHARLIE',
          teamName: 'Charlie Wing',
          teamPlacing: 1,
        }),
      ],
    },
  });
  renderWithProviders(
    <PlayersPanel
      event={anEventDetail()}
      loadingFromBcp={false}
      groupByTeam
      onGroupByTeamChange={onGroupByTeamChange}
    />,
  );
  const charlie = await screen.findByRole('button', { name: /Charlie Wing/ });
  const alpha = screen.getByRole('button', { name: /Alpha Squad/ });
  expect(charlie.compareDocumentPosition(alpha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(charlie).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(charlie);
  expect(charlie).toHaveAttribute('aria-expanded', 'false');

  fireEvent.click(screen.getByRole('switch', { name: 'Group by team' }));
  expect(onGroupByTeamChange).toHaveBeenCalledWith(false);
});
```

Update the file's other renders to pass `groupByTeam={false} onGroupByTeamChange={() => undefined}`.

Implement in `PlayersPanel.tsx`:

- New props `groupByTeam: boolean` and `onGroupByTeamChange: (next: boolean) => void`.
- Extract the column list into a local function `playerColumns({ showTeam, onOpen })`. It returns the existing columns, and the Team column is hidden when `!showTeam`.
- On team events, render a `Switch` labelled "Group by team" in the filter row (`checked={groupByTeam}`, `onChange={(e) => onGroupByTeamChange(e.currentTarget.checked)}`).
- When `event.isTeamEvent && groupByTeam`, render the filtered players with `groupPlayersByTeam(filtered)`, skipping empty groups. Each group is a `Panel p={0}` holding:
  - a header `UnstyledButton` with `aria-expanded`, showing the team name, `#placing` (numeric) and the player count (numeric);
  - a Mantine `Collapse` (`in={!collapsed.has(key)}`) wrapping a `DataTable` with `playerColumns({ showTeam: false, … })`.

  Keep the collapsed team keys in `useState<Set<string>>` (key = `teamId ?? 'none'`), all expanded by default. The empty text, fetching state, row click and drawer behave as today.

- Otherwise, render the single table exactly as today.

In `EventPage.tsx`, accept `groupByTeam` and `onGroupByTeamChange` props and pass them to `PlayersPanel`. In `apps/web/src/routes/events.$eventId.tsx`:

```tsx
  validateSearch: z.object({
    tab: z.enum(tabValues).catch('players'),
    group: z.enum(['team', 'none']).catch('team'),
  }),
```

and pass `groupByTeam={group === 'team'}` and `onGroupByTeamChange={(next) => void navigate({ search: (prev) => ({ ...prev, group: next ? 'team' : 'none' }), replace: true })}`. The tab change also keeps `group`: `search: (prev) => ({ ...prev, tab: next })`. The team page's back link from task 6 passes `search={{ tab: 'standings', group: 'team' }}` if the router's types require all keys; if so, update that test's expected href to `/events/EVT1?tab=standings&group=team`. Update `EventPage.test.tsx`'s `tabProps` with the two new props.

- [ ] **Step 4: Fetch-queue wording**

Spec §7.6 changes the header and Settings copy.

`QueueIndicator.tsx`:

- The label becomes "Fetching" instead of "Lists", and "N jobs" instead of "N queued".
- The paused-for-login text becomes "Fetching paused: login expired".
- Examples: "Fetching · 12 jobs · ~1 min", "Fetching · 3 failed", "Fetching · paused".

Update the doc comment and its tests' expected strings. Use "1 job" for one.

`QueueControls.tsx`: under the totals line, add a per-kind line built from `state.totals.byKind` that lists only kinds with open work (queued + fetching), always in the order lists, pairing rounds, events, e.g. "Lists 3 · Pairing rounds 12 · Events 1". Hide the line when nothing is open. Add a test:

```tsx
it('breaks the open jobs down by kind', () => {
  renderWithProviders(
    <QueueControls
      state={{
        ...base,
        totals: {
          queued: 15,
          fetching: 1,
          failed: 0,
          byKind: {
            list: { queued: 3, fetching: 0, failed: 0 },
            event: { queued: 0, fetching: 1, failed: 0 },
            'pairings-round': { queued: 12, fetching: 0, failed: 0 },
          },
        },
      }}
    />,
  );
  expect(
    screen.getByText(
      (_, el) => el?.tagName === 'P' && el.textContent === 'Lists 3 · Pairing rounds 12 · Events 1',
    ),
  ).toBeInTheDocument();
});
```

(Figures inside use `numeric` spans, as the other lines do.)

`FetchQueueCard.tsx`: the title becomes "Fetch queue", and the text becomes "Army lists and pairings are fetched from BCP in the background, one request every N s." Update its test if one checks the copy.

- [ ] **Step 5: End-to-end test**

Create `e2e/team-analysis.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('fetch a team event’s pairings, read the standings and open a team', async ({ page }) => {
  await page.goto('/?size=all&from=2026-01-01&to=2026-12-31');
  const fetchButton = page.getByRole('button', { name: 'Fetch', exact: true });
  const event = page.getByRole('button', { name: 'Sample Team Open' });
  // Another spec may already have fetched this range from the same server.
  await expect(event.or(fetchButton)).toBeVisible({ timeout: 20_000 });
  if (await fetchButton.isVisible()) await fetchButton.click();
  await event.click();
  await expect(page.getByRole('heading', { name: 'Sample Team Open' })).toBeVisible();

  // Players are grouped by team on team events.
  await expect(page.getByRole('button', { name: /Alpha Squad/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Standings' }).click();
  await page.getByRole('button', { name: 'Fetch pairings' }).click();
  // The fetch queue (200 ms per job in e2e) fetches both rounds; the tab refreshes itself.
  const alpha = page.getByRole('link', { name: 'Alpha Squad' });
  await expect(alpha).toBeVisible({ timeout: 20_000 });

  await alpha.click();
  await expect(page.getByRole('heading', { name: 'Alpha Squad' })).toBeVisible();
  await expect(page.getByText('Ada Archer')).toBeVisible();
});
```

Run: `pnpm e2e`
Expected: 2 passed.

- [ ] **Step 6: README**

In "Using it", add after the event-page bullet:

```markdown
- **Team events** also have **Rounds** (each team matchup opens to its games) and **Standings**
  (click a team for each player's games). Their data comes from **Fetch pairings**, which queues
  one request per round in the same background queue as army lists. For bracket-style events
  (e.g. GW team events) BCP has no victory points, so VP shows as "–".
- The **Players & lists** tab groups team events' players by team; switch it off with
  **Group by team**.
```

Replace remaining mentions of the list queue with "fetch queue" (for example, the header indicator description and Settings), and document `FETCH_QUEUE_INTERVAL_MS` (with the note that `LIST_QUEUE_INTERVAL_MS` still works).

- [ ] **Step 7: Check and commit**

```bash
pnpm check
pnpm e2e
git add -A
git commit -m "feat(web): players grouped by team, fetch-queue wording; e2e and README for team analysis

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
