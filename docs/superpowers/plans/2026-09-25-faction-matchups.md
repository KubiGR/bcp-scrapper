# Faction Matchups Implementation Plan (plan 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A faction-vs-faction matchup matrix (win rate or average game points, min games, disposition filter, drill-down to the games), as a Matchups tab on each event and as a cross-event page that combines chosen events and can queue their missing pairings.

**Architecture:** One pure function in `@bcp/shared` builds the matrix from flat "matchup games" (each game with both players' faction and disposition). The API loads those games for one event or a set of events and returns the matrix; a drill-down route returns one cell's games. The web renders one `FactionMatrix` component on both the event tab and `/analysis/matchups`.

**Tech Stack:** as plans 1–4 (Hono, Drizzle with Postgres/PGlite, Zod 4, React 19 + React Compiler, Mantine 9.6.2, TanStack Router/Query, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-24-team-analysis-design.md` — plan 5 = §5.5–5.6, the plan-5 rows of §6, §7.5 and §9 "Plan 5". Read with the main spec `2026-09-23-bcp-analyzer-design.md`.

**Execution note:** build in a separate git worktree (not the user's working copy): the user's dev server runs from the main checkout and applies migrations on every restart, so half-written files must never appear there.

**Deliberate refinements of the spec (apply when reading it):**

- **`minGames` is applied in the browser.** The API returns every cell with its counts; hiding thin cells is a display choice, so changing it never refetches.
- **Drill-down is its own route** (`…/matchups/games?row&col`), taking the same filters as the matrix, so the matrix response stays small for many events.
- **Cross-event selection uses two URL lists.** Synced events are included unless listed in `exclude`; partial and missing events are excluded unless listed in `include`.
- **Only big events.** The cross-event list comes from the catalogue, which since the big-events change holds only events with 4+ rounds and 20+ players; singles events are not listed (team events only, per spec §5.6).
- **Disposition filter:** `disposition` (one of the stored values) with `side = 'row'` (the row side played it) or `'both'` (both sides did).

## Global Constraints

- Node 24, pnpm 12, TypeScript `~6.0.3`, Zod 4. Strict type-checked ESLint `--max-warnings=0`; no `any`. Prettier.
- Tests next to the code; no network and no real Postgres in tests (PGlite). Never read, print or source `.env`.
- Mantine 9.6.2; minimal dark theme: `Panel`, cyan (`neon`) for interface chrome only, **plasma magenta only in data**, `numeric` class on figures only (never whole sentences); keyboard reachable controls; `aria-live="polite"` on progress text; no manual memoisation.
- Every API read is validated by shared schemas; every data view has loading, empty and error states.
- State-changing routes use `requireJson`; the Host guard stays.
- No bursts to BCP: bulk pairings go through the fetch queue at priority 0 (one job per tick).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run commands in the foreground; `pnpm vitest run --project api|web|shared <path>`, never bare `vitest`.

## Review Focus

1. **Mirror matches and byes.** A mirror (same faction both sides) counts on the diagonal once per side but shows no win rate; byes and games with an unknown result never count. _Task 1 (matrix test)._
2. **Mixed scoring scales.** Events whose games score to different totals (20 vs 100) must disable the game-points view with "Events use different scoring"; win rate still works. _Task 1 (scale test); Task 3 (toggle test)._
3. **Players without a faction.** Games where either side has no faction are left out of the matrix and its drill-down, never shown as a "null" row. _Task 1._
4. **An empty selection.** No events in the range, or all unticked, or no games yet: the page shows an empty state (not an empty table or an error), and the Sync button is hidden or disabled with a count of 0. _Task 4._
5. **Bulk sync twice.** Clicking "Sync pairings for N events" twice (or while jobs run) queues nothing new; events already synced are never re-queued by the bulk button. _Task 2 (route test)._

## File Map

```
packages/shared/src/analysis/matchups.ts        (new) MatchupGame, computeFactionMatrix, eventScale, cellGames
packages/shared/src/analysis/matchup-schemas.ts (new) response schemas
apps/api/src/repo/matchups.ts                   (new) loadMatchupGames(db, eventIds), pairingsStates(db, eventIds), teamEventsInRange
apps/api/src/routes/matchups.ts                 (new) event + cross-event matrix, drill-down, bulk pairings queue
apps/web/src/features/matchups/                 (new) queries, FactionMatrix, MatrixControls, CellDrawer, MatchupsPanel, MatchupsPage
apps/web/src/features/event/EventPage.tsx       + Matchups tab
apps/web/src/routes/analysis.matchups.tsx       (new) /analysis/matchups
apps/web/src/components/AppLayout.tsx           + "Matchups" nav link
e2e/team-analysis.spec.ts                       + matchups step
```

---

### Task 1: Shared: the faction matrix

**Files:**

- Create: `packages/shared/src/analysis/matchups.ts`, `packages/shared/src/analysis/matchup-schemas.ts`, `packages/shared/src/analysis/matchups.test.ts`
- Modify: `packages/shared/src/analysis/index.ts` (export both)

**Interfaces:**

- Produces:
  - `MatchupSide = { playerId: string; name: string; faction: string | null; disposition: string | null; teamName: string | null }`
  - `MatchupGame = { id; eventId; eventName; round; tableNo: number | null; a: MatchupSide; b: MatchupSide | null; pointsA: number | null; pointsB: number | null; result: GameResult | null }`
  - `DispositionFilter = { disposition: string | null; side: 'row' | 'both' }`
  - `computeFactionMatrix(games, filter): FactionMatrix`
  - `eventScale(games): number | null` and `scalesAgree(games): { consistent: boolean; scale: number | null }`
  - `cellGames(games, row, col, filter): CellGame[]`
  - Schemas: `MatrixCellSchema`, `FactionMatrixSchema`, `CellGameSchema`, `MatchupsResponseSchema`, `CellGamesResponseSchema`, `MatchupEventSchema`, `CrossEventMatchupsResponseSchema`, `PairingsStateSchema`, `BulkPairingsResultSchema` (and their types).

- [ ] **Step 1: Schemas**

`packages/shared/src/analysis/matchup-schemas.ts`:

```ts
import { z } from 'zod';

const count = z.number().int().nonnegative();

/** One ordered pair of factions: the row side's results against the column side. */
export const MatrixCellSchema = z.object({
  row: z.string(),
  col: z.string(),
  games: count,
  wins: count,
  draws: count,
  losses: count,
  /** (wins + ½ draws) / games; null on the diagonal (mirror matches). */
  winRate: z.number().min(0).max(1).nullable(),
  /** Mean of the row side's game points over games with points; null when none have points. */
  avgPoints: z.number().nullable(),
});
export type MatrixCell = z.infer<typeof MatrixCellSchema>;

export const FactionMatrixSchema = z.object({
  /** Factions ordered by games played (most first), then name. */
  factions: z.array(z.string()),
  cells: z.array(MatrixCellSchema),
  /** Games counted (each game once, not once per side). */
  games: count,
});
export type FactionMatrix = z.infer<typeof FactionMatrixSchema>;

export const ScaleSchema = z.object({
  /** True when every included event scores its games to the same total. */
  consistent: z.boolean(),
  /** That shared total (e.g. 20), or null when inconsistent or unknown. */
  scale: z.number().nullable(),
});

export const MatchupsResponseSchema = z.object({
  matrix: FactionMatrixSchema,
  scoring: ScaleSchema,
});
export type MatchupsResponse = z.infer<typeof MatchupsResponseSchema>;

export const CellGameSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  eventName: z.string(),
  round: z.number().int().positive(),
  tableNo: z.number().int().nullable(),
  row: z.object({
    name: z.string(),
    faction: z.string(),
    disposition: z.string().nullable(),
    teamName: z.string().nullable(),
  }),
  col: z.object({
    name: z.string(),
    faction: z.string(),
    disposition: z.string().nullable(),
    teamName: z.string().nullable(),
  }),
  outcome: z.enum(['win', 'loss', 'draw']),
  rowPoints: z.number().nullable(),
  colPoints: z.number().nullable(),
});
export type CellGame = z.infer<typeof CellGameSchema>;

export const CellGamesResponseSchema = z.object({ games: z.array(CellGameSchema) });
export type CellGamesResponse = z.infer<typeof CellGamesResponseSchema>;

export const PairingsStateSchema = z.enum(['synced', 'fetching', 'partial', 'missing']);
export type PairingsState = z.infer<typeof PairingsStateSchema>;

export const MatchupEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.iso.datetime(),
  playerCount: count,
  teamCount: count.nullable(),
  roundCount: count,
  pairings: PairingsStateSchema,
  /** Counted in the combined matrix. */
  included: z.boolean(),
});
export type MatchupEvent = z.infer<typeof MatchupEventSchema>;

export const CrossEventMatchupsResponseSchema = MatchupsResponseSchema.extend({
  events: z.array(MatchupEventSchema),
});
export type CrossEventMatchupsResponse = z.infer<typeof CrossEventMatchupsResponseSchema>;

export const BulkPairingsRequestSchema = z.object({
  eventIds: z.array(z.string().min(1)).min(1).max(200),
});
export type BulkPairingsRequest = z.infer<typeof BulkPairingsRequestSchema>;

export const BulkPairingsResultSchema = z.object({
  /** Events that got at least one job queued. */
  events: count,
  queuedRounds: count,
  estimatedSeconds: count.nullable(),
});
export type BulkPairingsResult = z.infer<typeof BulkPairingsResultSchema>;
```

- [ ] **Step 2: Write the failing tests** (Review Focus 1–3)

`packages/shared/src/analysis/matchups.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  cellGames,
  computeFactionMatrix,
  scalesAgree,
  type MatchupGame,
  type MatchupSide,
} from './matchups';

const side = (
  id: string,
  faction: string | null,
  disposition: string | null = null,
): MatchupSide => ({
  playerId: id,
  name: `Player ${id}`,
  faction,
  disposition,
  teamName: null,
});
let n = 0;
const game = (
  a: MatchupSide,
  b: MatchupSide | null,
  pa: number | null,
  pb: number | null,
  result: MatchupGame['result'],
  eventId = 'E1',
): MatchupGame => ({
  id: `G${(n += 1)}`,
  eventId,
  eventName: `Event ${eventId}`,
  round: 1,
  tableNo: n,
  a,
  b,
  pointsA: pa,
  pointsB: pb,
  result,
});

const noFilter = { disposition: null, side: 'row' } as const;
const cell = (m: ReturnType<typeof computeFactionMatrix>, row: string, col: string) =>
  m.cells.find((c) => c.row === row && c.col === col);

describe('computeFactionMatrix', () => {
  const games = [
    game(side('1', 'Orks', 'Take and Hold'), side('2', 'Necrons', 'Disruption'), 15, 5, 'a_win'),
    game(side('3', 'Orks', 'Disruption'), side('4', 'Necrons', 'Disruption'), 10, 10, 'draw'),
    game(side('5', 'Necrons'), side('6', 'Orks'), 20, 0, 'a_win'),
    game(side('7', 'Orks'), side('8', 'Orks'), 12, 8, 'a_win'), // mirror
    game(side('9', 'Orks'), null, 20, null, 'a_win'), // bye
    game(side('10', 'Orks'), side('11', 'Necrons'), null, null, null), // no result
    game(side('12', null), side('13', 'Necrons'), 15, 5, 'a_win'), // no faction
  ];
  const matrix = computeFactionMatrix(games, noFilter);

  it('counts each game once per side, from the row side', () => {
    expect(cell(matrix, 'Orks', 'Necrons')).toEqual({
      row: 'Orks',
      col: 'Necrons',
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winRate: 0.5,
      avgPoints: 25 / 3,
    });
    expect(cell(matrix, 'Necrons', 'Orks')).toMatchObject({
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winRate: 0.5,
    });
  });

  it('puts mirrors on the diagonal, twice, with no win rate', () => {
    expect(cell(matrix, 'Orks', 'Orks')).toMatchObject({
      games: 2,
      wins: 1,
      losses: 1,
      winRate: null,
      avgPoints: 10,
    });
  });

  it('leaves out byes, unknown results and players without a faction', () => {
    expect(matrix.games).toBe(4);
    expect(matrix.factions).toEqual(['Orks', 'Necrons']); // Orks: 5 sides played, Necrons: 3
    expect(matrix.cells.some((c) => c.row === 'null' || c.col === 'null')).toBe(false);
  });

  it('filters by disposition: the row side, or both sides', () => {
    const rowSide = computeFactionMatrix(games, { disposition: 'Disruption', side: 'row' });
    expect(cell(rowSide, 'Orks', 'Necrons')).toMatchObject({ games: 1, draws: 1 }); // player 3
    expect(cell(rowSide, 'Necrons', 'Orks')).toMatchObject({ games: 2, losses: 1, draws: 1 }); // players 2 and 4
    const both = computeFactionMatrix(games, { disposition: 'Disruption', side: 'both' });
    expect(both.games).toBe(1); // only players 3 vs 4
    expect(cell(both, 'Orks', 'Necrons')).toMatchObject({ games: 1, draws: 1 });
  });
});

describe('scalesAgree', () => {
  it('uses each event’s most common game total', () => {
    const twenty = [
      game(side('1', 'Orks'), side('2', 'Necrons'), 15, 5, 'a_win', 'A'),
      game(side('3', 'Orks'), side('4', 'Necrons'), 12, 8, 'a_win', 'A'),
      game(side('5', 'Orks'), side('6', 'Necrons'), 7, 3, 'a_win', 'A'), // an odd one out
      game(side('7', 'Orks'), side('8', 'Necrons'), 10, 10, 'draw', 'B'),
    ];
    expect(scalesAgree(twenty)).toEqual({ consistent: true, scale: 20 });
    const mixed = [...twenty, game(side('9', 'Orks'), side('10', 'Necrons'), 60, 40, 'a_win', 'C')];
    expect(scalesAgree(mixed)).toEqual({ consistent: false, scale: null });
    expect(scalesAgree([])).toEqual({ consistent: true, scale: null });
  });
});

describe('cellGames', () => {
  it('lists a cell’s games from the row side, in event, round and table order', () => {
    const games = [
      game(side('1', 'Orks'), side('2', 'Necrons'), 15, 5, 'a_win'),
      game(side('5', 'Necrons'), side('6', 'Orks'), 20, 0, 'a_win'),
      game(side('7', 'Orks'), side('8', 'Orks'), 12, 8, 'a_win'),
    ];
    const list = cellGames(games, 'Orks', 'Necrons', noFilter);
    expect(list.map((g) => [g.row.name, g.col.name, g.outcome, g.rowPoints, g.colPoints])).toEqual([
      ['Player 1', 'Player 2', 'win', 15, 5],
      ['Player 6', 'Player 5', 'loss', 0, 20],
    ]);
    const mirror = cellGames(games, 'Orks', 'Orks', noFilter);
    expect(mirror.map((g) => [g.row.name, g.outcome])).toEqual([
      ['Player 7', 'win'],
      ['Player 8', 'loss'],
    ]);
  });
});
```

Run: `pnpm vitest run --project shared src/analysis/matchups.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`packages/shared/src/analysis/matchups.ts`:

```ts
import type { GameResult } from '../domain';
import type { CellGame, FactionMatrix, MatrixCell } from './matchup-schemas';

export interface MatchupSide {
  playerId: string;
  name: string;
  faction: string | null;
  disposition: string | null;
  teamName: string | null;
}

/** One stored game with both sides' factions and dispositions; `b` is null for a bye. */
export interface MatchupGame {
  id: string;
  eventId: string;
  eventName: string;
  round: number;
  tableNo: number | null;
  a: MatchupSide;
  b: MatchupSide | null;
  pointsA: number | null;
  pointsB: number | null;
  result: GameResult | null;
}

/** `disposition: null` means no filter. `side: 'row'`: the row side played it; `'both'`: both sides did. */
export interface DispositionFilter {
  disposition: string | null;
  side: 'row' | 'both';
}

type Outcome = 'win' | 'loss' | 'draw';

/** A game from one side's point of view: that side is the row, the other the column. */
interface SidedGame {
  game: MatchupGame;
  row: MatchupSide & { faction: string };
  col: MatchupSide & { faction: string };
  outcome: Outcome;
  rowPoints: number | null;
  colPoints: number | null;
}

const same = (a: string | null, b: string | null) =>
  a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Both sides of every countable game: not a bye, a known result, both factions known. */
function sidesOf(games: MatchupGame[], filter: DispositionFilter): SidedGame[] {
  const sided: SidedGame[] = [];
  for (const game of games) {
    const { a, b, result } = game;
    if (!b || result === null || a.faction === null || b.faction === null) continue;
    if (filter.disposition !== null && filter.side === 'both') {
      if (!same(a.disposition, filter.disposition) || !same(b.disposition, filter.disposition))
        continue;
    }
    const aOutcome: Outcome = result === 'draw' ? 'draw' : result === 'a_win' ? 'win' : 'loss';
    const bOutcome: Outcome = aOutcome === 'draw' ? 'draw' : aOutcome === 'win' ? 'loss' : 'win';
    const pairs: SidedGame[] = [
      {
        game,
        row: { ...a, faction: a.faction },
        col: { ...b, faction: b.faction },
        outcome: aOutcome,
        rowPoints: game.pointsA,
        colPoints: game.pointsB,
      },
      {
        game,
        row: { ...b, faction: b.faction },
        col: { ...a, faction: a.faction },
        outcome: bOutcome,
        rowPoints: game.pointsB,
        colPoints: game.pointsA,
      },
    ];
    for (const pair of pairs) {
      if (
        filter.disposition !== null &&
        filter.side === 'row' &&
        !same(pair.row.disposition, filter.disposition)
      )
        continue;
      sided.push(pair);
    }
  }
  return sided;
}

/**
 * Faction-vs-faction results. Each countable game adds one entry per side (row = that side's
 * faction); mirrors land on the diagonal twice and get no win rate.
 */
export function computeFactionMatrix(
  games: MatchupGame[],
  filter: DispositionFilter,
): FactionMatrix {
  const sided = sidesOf(games, filter);
  const cells = new Map<string, MatrixCell & { pointsSum: number; pointsGames: number }>();
  const playedBy = new Map<string, number>();
  for (const s of sided) {
    const key = `${s.row.faction}\u0000${s.col.faction}`;
    const cell = cells.get(key) ?? {
      row: s.row.faction,
      col: s.col.faction,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      avgPoints: null,
      pointsSum: 0,
      pointsGames: 0,
    };
    cell.games += 1;
    if (s.outcome === 'win') cell.wins += 1;
    if (s.outcome === 'draw') cell.draws += 1;
    if (s.outcome === 'loss') cell.losses += 1;
    if (s.rowPoints !== null) {
      cell.pointsSum += s.rowPoints;
      cell.pointsGames += 1;
    }
    cells.set(key, cell);
    playedBy.set(s.row.faction, (playedBy.get(s.row.faction) ?? 0) + 1);
  }
  const factions = [...playedBy.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .map(([faction]) => faction);
  return {
    factions,
    cells: [...cells.values()].map(({ pointsSum, pointsGames, ...cell }) => ({
      ...cell,
      winRate: cell.row === cell.col ? null : (cell.wins + cell.draws / 2) / cell.games,
      avgPoints: pointsGames === 0 ? null : pointsSum / pointsGames,
    })),
    games: new Set(sided.map((s) => s.game.id)).size,
  };
}

/** The most common `pointsA + pointsB` over an event's games with both points; null if none. */
export function eventScale(games: MatchupGame[]): number | null {
  const counts = new Map<number, number>();
  for (const game of games) {
    if (game.pointsA === null || game.pointsB === null || !game.b) continue;
    const total = game.pointsA + game.pointsB;
    counts.set(total, (counts.get(total) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [total, seen] of counts) {
    if (seen > bestCount || (seen === bestCount && best !== null && total < best)) {
      best = total;
      bestCount = seen;
    }
  }
  return best;
}

/** Whether every event (with a known scale) scores its games to the same total. */
export function scalesAgree(games: MatchupGame[]): { consistent: boolean; scale: number | null } {
  const byEvent = new Map<string, MatchupGame[]>();
  for (const game of games) byEvent.set(game.eventId, [...(byEvent.get(game.eventId) ?? []), game]);
  const scales = new Set(
    [...byEvent.values()].map(eventScale).filter((scale): scale is number => scale !== null),
  );
  if (scales.size > 1) return { consistent: false, scale: null };
  return { consistent: true, scale: [...scales][0] ?? null };
}

/** The games behind one cell, from the row side, in round then table order. */
export function cellGames(
  games: MatchupGame[],
  row: string,
  col: string,
  filter: DispositionFilter,
): CellGame[] {
  return sidesOf(games, filter)
    .filter((s) => s.row.faction === row && s.col.faction === col)
    .sort(
      (x, y) =>
        x.game.eventName.localeCompare(y.game.eventName) ||
        x.game.round - y.game.round ||
        (x.game.tableNo ?? 0) - (y.game.tableNo ?? 0),
    )
    .map((s) => ({
      id: s.game.id,
      eventId: s.game.eventId,
      eventName: s.game.eventName,
      round: s.game.round,
      tableNo: s.game.tableNo,
      row: {
        name: s.row.name,
        faction: s.row.faction,
        disposition: s.row.disposition,
        teamName: s.row.teamName,
      },
      col: {
        name: s.col.name,
        faction: s.col.faction,
        disposition: s.col.disposition,
        teamName: s.col.teamName,
      },
      outcome: s.outcome,
      rowPoints: s.rowPoints,
      colPoints: s.colPoints,
    }));
}
```

Export both files from `packages/shared/src/analysis/index.ts`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run --project shared src/analysis`
Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
pnpm check
git add -A
git commit -m "feat(shared): faction matchup matrix with scale check and drill-down

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: API: matchups for an event and across events; bulk pairings

**Files:**

- Create: `apps/api/src/repo/matchups.ts` (+ `matchups.test.ts`), `apps/api/src/routes/matchups.ts` (+ `matchups.test.ts`)
- Modify: `apps/api/src/app.ts` (mount), `apps/api/src/fetch-queue/queue-pairings.ts` (a bulk helper)

**Interfaces:**

- Consumes: `computeFactionMatrix`, `scalesAgree`, `cellGames`, `MatchupGame`, the schemas (Task 1); `queueEventPairings(deps, eventId, priority)` (plan 4); `requireEvent`; `EventSizeRule`/`isBigEvent` and `AppDeps.eventRule` (big-events change); `FetchQueueWorker.estimateSecondsFor()`.
- Produces:
  - `loadMatchupGames(db, eventIds: string[]): Promise<MatchupGame[]>`
  - `pairingsStates(db, eventIds: string[]): Promise<Map<string, PairingsState>>`
  - `teamEventsInRange(db, { from, to }, rule): Promise<EventRow[]>` (team events whose start date is in the range, big only, newest first)
  - `queueManyEventPairings(deps, eventIds, priority): Promise<BulkPairingsResult>`
  - Routes (all GET take `disposition?` and `side?=row|both`):
    - `GET /api/events/:id/matchups` → `MatchupsResponse`
    - `GET /api/events/:id/matchups/games?row&col` → `CellGamesResponse`
    - `GET /api/matchups?from&to&exclude&include` → `CrossEventMatchupsResponse` (`from`/`to` ISO dates, default the last 90 days ending today; `exclude`/`include` comma-separated event ids)
    - `GET /api/matchups/games?from&to&exclude&include&row&col` → `CellGamesResponse`
    - `POST /api/pairings-queue` body `BulkPairingsRequest` → `BulkPairingsResult`

- [ ] **Step 1: Write the failing tests** (Review Focus 5)

`apps/api/src/repo/matchups.test.ts` — sync the bracket fixture event (as in `routes/analysis.test.ts`: `syncEvent` then `syncRoundPairings` for each round) and assert:

```ts
it('loads each game with both sides’ faction, disposition and team', async () => {
  const games = await loadMatchupGames(db, ['EVTBRACKET01']);
  expect(games).toHaveLength(14);
  const first = games.find((g) => g.id === 'GB-R1-1');
  expect(first).toMatchObject({
    eventId: 'EVTBRACKET01',
    eventName: 'Sample Bracket Teams',
    round: 1,
    a: { playerId: 'PB-R1', faction: 'Adepta Sororitas', teamName: 'Red Legion' },
    b: { playerId: 'PB-B1', faction: 'Necrons', teamName: 'Blue Wardens' },
    pointsA: 20,
    pointsB: 0,
    result: 'a_win',
  });
  expect(games.find((g) => g.id === 'GB-R1-5')?.b).toBeNull(); // bye
});

it('reports each event’s pairings state', async () => {
  const states = await pairingsStates(db, ['EVTBRACKET01', 'EVTTEAM0001']);
  // EVTBRACKET01 has all rounds stored but pairings_synced_at is only set by the queue → 'partial';
  // EVTTEAM0001 has nothing → 'missing'. Then set pairings_synced_at and expect 'synced';
  // queue a round job for EVTTEAM0001 and expect 'fetching'.
});
```

(Write the second test fully along the comments: `db.update(events).set({ pairingsSyncedAt: new Date() })…` and `enqueueEventPairings(db, 'EVTTEAM0001', { rounds: [1], priority: 0 })` — EVTTEAM0001 needs its event row first: `syncEvent({ db, source }, 'EVTTEAM0001')`.)

`apps/api/src/routes/matchups.test.ts` — build the app like `routes/analysis.test.ts` (with `eventRule: ALL_EVENTS`, `fetchQueue: testFetchQueue(db, source)`), load the bracket event, and:

```ts
it('returns an event’s matrix and one cell’s games', async () => {
  const { body } = await get<MatchupsResponse>('/api/events/EVTBRACKET01/matchups');
  expect(body.scoring).toEqual({ consistent: true, scale: 20 });
  expect(body.matrix.games).toBe(10); // 14 games minus 4 byes
  expect(body.matrix.factions).toContain('Adepta Sororitas');
  const games = await get<CellGamesResponse>(
    '/api/events/EVTBRACKET01/matchups/games?row=Adepta%20Sororitas&col=Necrons',
  );
  expect(games.body.games[0]).toMatchObject({
    row: { faction: 'Adepta Sororitas' },
    col: { faction: 'Necrons' },
  });
});

it('filters by disposition', async () => {
  const { body } = await get<MatchupsResponse>(
    '/api/events/EVTBRACKET01/matchups?disposition=Take%20and%20Hold&side=row',
  );
  // every counted row side played Take and Hold: check against the fixture's dispositions
  expect(body.matrix.games).toBeGreaterThan(0);
});

it('combines events in a range: synced included, partial excluded unless included', async () => {
  // EVTBRACKET01 is partial (no pairings_synced_at) → excluded by default, included via ?include=
  const range = 'from=2026-01-01&to=2026-12-31';
  const byDefault = await get<CrossEventMatchupsResponse>(`/api/matchups?${range}`);
  expect(byDefault.body.events.find((e) => e.id === 'EVTBRACKET01')).toMatchObject({
    pairings: 'partial',
    included: false,
  });
  expect(byDefault.body.matrix.games).toBe(0);
  const included = await get<CrossEventMatchupsResponse>(
    `/api/matchups?${range}&include=EVTBRACKET01`,
  );
  expect(included.body.matrix.games).toBe(10);
});

it('queues missing pairings for many events once, never re-queueing synced ones', async () => {
  // EVTTEAM0001 synced (event row) but no pairings → queues its 2 rounds; EVTBRACKET01 marked synced → skipped
  const first = await post<BulkPairingsResult>('/api/pairings-queue', {
    eventIds: ['EVTTEAM0001', 'EVTBRACKET01'],
  });
  expect(first).toMatchObject({ events: 1, queuedRounds: 2 });
  const again = await post<BulkPairingsResult>('/api/pairings-queue', {
    eventIds: ['EVTTEAM0001', 'EVTBRACKET01'],
  });
  expect(again).toMatchObject({ events: 0, queuedRounds: 0 });
});

it('validates input', async () => {
  expect((await get('/api/events/NOPE/matchups')).status).toBe(404);
  expect((await get('/api/matchups?from=2026-12-31&to=2026-01-01')).status).toBe(400);
  expect((await post('/api/pairings-queue', { eventIds: [] }, true)).status).toBe(400);
});
```

(Set up in `beforeEach`: `syncEvent` both fixture events so they're in the catalogue with `lastSyncedAt`; load EVTBRACKET01's rounds; for the bulk test set EVTBRACKET01's `pairingsSyncedAt`. Both fixture events start in 2026. Adjust the `from`/`to` in the test if their start dates differ. `get`/`post` helpers like other route tests; `post(..., true)` returns the raw Response.)

Run: `pnpm vitest run --project api src/repo/matchups.test.ts src/routes/matchups.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 2: Implement the repository**

`apps/api/src/repo/matchups.ts`:

```ts
import type { MatchupGame, PairingsState } from '@bcp/shared';
import { isBigEvent, type EventSizeRule } from '@bcp/shared';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { events, fetchQueue, games, players, teams } from '../db/schema';
import type { EventRow } from './events';
import { storedPairingsSummary } from './pairings';

/** Every stored game of the given events, with both players' faction, disposition and team. */
export async function loadMatchupGames(db: Db, eventIds: string[]): Promise<MatchupGame[]> {
  if (eventIds.length === 0) return [];
  const pa = alias(players, 'pa');
  const pb = alias(players, 'pb');
  const ta = alias(teams, 'ta');
  const tb = alias(teams, 'tb');
  const rows = await db
    .select({
      id: games.id,
      eventId: games.eventId,
      eventName: events.name,
      round: games.round,
      tableNo: games.tableNo,
      pointsA: games.gamePointsA,
      pointsB: games.gamePointsB,
      result: games.result,
      aId: games.playerAId,
      aName: pa.name,
      aFaction: pa.faction,
      aDisposition: pa.disposition,
      aTeam: ta.name,
      bId: games.playerBId,
      bName: pb.name,
      bFaction: pb.faction,
      bDisposition: pb.disposition,
      bTeam: tb.name,
    })
    .from(games)
    .innerJoin(events, eq(events.id, games.eventId))
    .leftJoin(pa, eq(pa.id, games.playerAId))
    .leftJoin(pb, eq(pb.id, games.playerBId))
    .leftJoin(ta, eq(ta.id, pa.teamId))
    .leftJoin(tb, eq(tb.id, pb.teamId))
    .where(inArray(games.eventId, eventIds));
  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    eventName: row.eventName,
    round: row.round,
    tableNo: row.tableNo,
    pointsA: row.pointsA,
    pointsB: row.pointsB,
    result: row.result,
    a: {
      playerId: row.aId,
      name: row.aName ?? 'Unknown player',
      faction: row.aFaction ?? null,
      disposition: row.aDisposition ?? null,
      teamName: row.aTeam ?? null,
    },
    b:
      row.bId === null
        ? null
        : {
            playerId: row.bId,
            name: row.bName ?? 'Unknown player',
            faction: row.bFaction ?? null,
            disposition: row.bDisposition ?? null,
            teamName: row.bTeam ?? null,
          },
  }));
}

/**
 * Each event's pairings state: fetching (open event/pairings jobs), synced (every round fetched
 * through the queue), partial (some rounds stored, or a failed fetch), or missing.
 */
export async function pairingsStates(
  db: Db,
  eventIds: string[],
): Promise<Map<string, PairingsState>> {
  const states = new Map<string, PairingsState>();
  if (eventIds.length === 0) return states;
  const [rows, open] = await Promise.all([
    db
      .select({ id: events.id, syncedAt: events.pairingsSyncedAt })
      .from(events)
      .where(inArray(events.id, eventIds)),
    db
      .selectDistinct({ eventId: fetchQueue.eventId })
      .from(fetchQueue)
      .where(
        and(
          inArray(fetchQueue.eventId, eventIds),
          inArray(fetchQueue.kind, ['event', 'pairings-round']),
          inArray(fetchQueue.status, ['queued', 'fetching']),
        ),
      ),
  ]);
  const fetching = new Set(open.map((row) => row.eventId));
  for (const row of rows) {
    if (fetching.has(row.id)) states.set(row.id, 'fetching');
    else if (row.syncedAt) states.set(row.id, 'synced');
    else {
      const stored = await storedPairingsSummary(db, row.id);
      states.set(row.id, stored.rounds > 0 ? 'partial' : 'missing');
    }
  }
  return states;
}

/** Team events starting in [from, to] (dates), big only, newest first. */
export async function teamEventsInRange(
  db: Db,
  range: { from: string; to: string },
  rule: EventSizeRule,
): Promise<EventRow[]> {
  const start = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const rows = await db
    .select()
    .from(events)
    .where(
      and(eq(events.isTeamEvent, true), gte(events.startDate, start), lt(events.startDate, end)),
    )
    .orderBy(desc(events.startDate), events.id);
  return rows.filter((row) => isBigEvent(row, rule));
}
```

(`storedPairingsSummary` per non-synced event is N small queries; the range holds at most a few dozen big team events, so that's fine. If lint flags `await` in a loop, collect the ids and `Promise.all` them.)

- [ ] **Step 3: Bulk queueing**

Add to `apps/api/src/fetch-queue/queue-pairings.ts`:

```ts
/**
 * Queues pairings for many events at once (the cross-event page). Events whose pairings are
 * already synced are skipped; open jobs are never duplicated. Nothing is fetched here: the
 * worker does it, one job per tick.
 */
export async function queueManyEventPairings(
  deps: { db: Db; fetchQueue: FetchQueueWorker },
  eventIds: string[],
  priority: number,
): Promise<BulkPairingsResult> {
  let eventsQueued = 0;
  let queuedRounds = 0;
  for (const eventId of new Set(eventIds)) {
    const event = await findEvent(deps.db, eventId);
    if (!event || event.pairingsSyncedAt) continue;
    const result = await queueEventPairings(deps, eventId, priority);
    if (result.queuedRounds > 0 || result.eventQueued) eventsQueued += 1;
    queuedRounds += result.queuedRounds;
  }
  return {
    events: eventsQueued,
    queuedRounds,
    estimatedSeconds: await deps.fetchQueue.estimateSecondsFor(),
  };
}
```

Careful: `queueEventPairings` returns `eventQueued: true` whenever an event job is (or already was) open. For "queued nothing new" on the second call, count an event only when `queuedRounds > 0` or when this call inserted an event job. If `enqueueEventPairings` can't tell "inserted" from "already open", count `eventQueued` only for events that had no open pairings job before the call (check with `eventPairingsJobs(db, id).queued === 0` first, and skip those that already have open jobs). Make the route test's second call assert `{ events: 0, queuedRounds: 0 }`.

- [ ] **Step 4: Routes**

`apps/api/src/routes/matchups.ts`:

```ts
import {
  BulkPairingsRequestSchema,
  cellGames,
  computeFactionMatrix,
  scalesAgree,
  type DispositionFilter,
  type EventSizeRule,
} from '@bcp/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/client';
import { queueManyEventPairings } from '../fetch-queue/queue-pairings';
import type { FetchQueueWorker } from '../fetch-queue/worker';
import { loadMatchupGames, pairingsStates, teamEventsInRange } from '../repo/matchups';
import { parseInput } from '../validation';
import { requireEvent } from './require-event';
import { requireJson } from './require-json';

const FilterSchema = z.object({
  disposition: z.string().trim().min(1).optional(),
  side: z.enum(['row', 'both']).default('row'),
});
const CellSchema = z.object({ row: z.string().min(1), col: z.string().min(1) });
const ids = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : [],
  );
const RangeSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    exclude: ids,
    include: ids,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

const toFilter = (q: z.infer<typeof FilterSchema>): DispositionFilter => ({
  disposition: q.disposition ?? null,
  side: q.side,
});

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export function matchupsRoutes(deps: {
  db: Db;
  fetchQueue: FetchQueueWorker;
  eventRule: EventSizeRule;
  now: () => Date;
}) {
  const { db } = deps;

  /** The events of a range and which of them count: synced unless excluded, others only if included. */
  async function selection(query: Record<string, string>) {
    const range = parseInput(RangeSchema, query);
    const today = deps.now();
    const to = range.to ?? isoDay(today);
    const from = range.from ?? isoDay(new Date(today.getTime() - 90 * 86_400_000));
    const rows = await teamEventsInRange(db, { from, to }, deps.eventRule);
    const states = await pairingsStates(
      db,
      rows.map((row) => row.id),
    );
    const events = rows.map((row) => {
      const pairings = states.get(row.id) ?? 'missing';
      const included =
        pairings === 'synced' ? !range.exclude.includes(row.id) : range.include.includes(row.id);
      return {
        id: row.id,
        name: row.name,
        startDate: row.startDate.toISOString(),
        playerCount: row.playerCount,
        teamCount: row.teamCount,
        roundCount: row.roundCount,
        pairings,
        included,
      };
    });
    return {
      events,
      includedIds: events.filter((event) => event.included).map((event) => event.id),
    };
  }

  return new Hono()
    .get('/events/:id/matchups', async (c) => {
      const id = c.req.param('id');
      await requireEvent(db, id);
      const filter = toFilter(parseInput(FilterSchema, c.req.query()));
      const games = await loadMatchupGames(db, [id]);
      return c.json({ matrix: computeFactionMatrix(games, filter), scoring: scalesAgree(games) });
    })
    .get('/events/:id/matchups/games', async (c) => {
      const id = c.req.param('id');
      await requireEvent(db, id);
      const query = c.req.query();
      const filter = toFilter(parseInput(FilterSchema, query));
      const { row, col } = parseInput(CellSchema, query);
      return c.json({ games: cellGames(await loadMatchupGames(db, [id]), row, col, filter) });
    })
    .get('/matchups', async (c) => {
      const query = c.req.query();
      const filter = toFilter(parseInput(FilterSchema, query));
      const { events, includedIds } = await selection(query);
      const games = await loadMatchupGames(db, includedIds);
      return c.json({
        events,
        matrix: computeFactionMatrix(games, filter),
        scoring: scalesAgree(games),
      });
    })
    .get('/matchups/games', async (c) => {
      const query = c.req.query();
      const filter = toFilter(parseInput(FilterSchema, query));
      const { row, col } = parseInput(CellSchema, query);
      const { includedIds } = await selection(query);
      return c.json({
        games: cellGames(await loadMatchupGames(db, includedIds), row, col, filter),
      });
    })
    .post('/pairings-queue', requireJson, async (c) => {
      const { eventIds } = parseInput(
        BulkPairingsRequestSchema,
        await c.req.json<unknown>().catch(() => null),
      );
      return c.json(await queueManyEventPairings(deps, eventIds, 0));
    });
}
```

Mount in `apps/api/src/app.ts`: `app.route('/api', matchupsRoutes({ ...deps, now }));` (check how `now` and `eventRule` are provided to the other route groups and follow that).

- [ ] **Step 5: Run, check, commit**

Run: `pnpm vitest run --project api src/repo/matchups.test.ts src/routes/matchups.test.ts`
Expected: PASS.

```bash
pnpm check
git add -A
git commit -m "feat(api): faction matchups for an event and across events; bulk pairings queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Web: the matrix, its controls and drill-down; the event Matchups tab

**Files:**

- Create in `apps/web/src/features/matchups/`: `matchups-queries.ts`, `matrix-view.ts` (+ test), `FactionMatrix.tsx` (+ test), `FactionMatrix.module.css`, `MatrixControls.tsx` (+ test), `CellDrawer.tsx`, `MatchupsPanel.tsx` (+ test)
- Modify: `apps/web/src/features/event/EventPage.tsx` (+ test): a **Matchups** tab for team and singles events

**Interfaces:**

- Consumes: Task 1 schemas/types; Task 2 routes; `PairingsGate` (`features/analysis/PairingsGate.tsx`); `DispositionText` (`components/DispositionText.tsx`); `apiGet`.
- Produces:
  - `MatrixSettings = { metric: 'winRate' | 'points'; minGames: number; disposition: string | null; side: 'row' | 'both' }`, `DEFAULT_MATRIX_SETTINGS = { metric: 'winRate', minGames: 3, disposition: null, side: 'row' }`
  - `matrixParams(settings): Record<string, string>` (only `disposition`/`side` go to the API)
  - `eventMatchupsQuery(eventId, settings, live)`, `eventCellGamesQuery(eventId, cell, settings)`
  - `cellView(cell, settings, scale): { text: string; tone: 'good' | 'bad' | 'even' | 'mirror' | 'hidden' }` in `matrix-view.ts`
  - `<FactionMatrix matrix scoring settings onCell />`, `<MatrixControls settings onChange scoring dispositions />`, `<CellDrawer cell games loading error onClose />`, `<MatchupsPanel event />`

- [ ] **Step 1: The cell view helper (test first)**

`matrix-view.ts` decides what a cell shows:

- `games < minGames` → `{ text: '·', tone: 'hidden' }` (the title/tooltip still says the count);
- mirror (`row === col`) → `{ text: 'n', tone: 'mirror' }` (just the count);
- win rate: `text = "62% · 13"`, tone `good` when rate ≥ 0.55, `bad` when ≤ 0.45, else `even`;
- points (only offered when `scoring.consistent && scale !== null`): `text = "12.4 · 13"`, midpoint `scale / 2`, `good` ≥ midpoint × 1.1, `bad` ≤ midpoint × 0.9, else `even`; `avgPoints` null → `"– · 13"`, tone `even`.

Tests cover each branch, including the 0.55/0.45 boundaries and a null `avgPoints`.

- [ ] **Step 2: Components (tests first)**

`FactionMatrix.tsx`: a `Table` inside `Table.ScrollContainer` (horizontal scroll on phones). The first column header is empty; column headers are the factions (rotated or truncated with `title` for long names); row headers (`<Table.Th scope="row">`) are the factions. Each cell is an `UnstyledButton` (keyboard reachable, `aria-label` like "Orks vs Necrons: 62% win rate over 13 games") showing `cellView(...).text` in a `numeric` span, styled by tone via CSS module classes:

- `good` → cyan background tint (`var(--mantine-color-neon-9)` at low alpha / a light `neon` tint class),
- `bad` → plasma tint (`var(--mantine-color-plasma-9)`),
- `even` → neutral (`var(--mantine-color-dark-6)`),
- `mirror` → hatched background (`repeating-linear-gradient` of two dark tones),
- `hidden` → dimmed, not clickable (plain text, no button).
  Cells with no games render empty. The text always carries the value, so colour is never the only signal. Clicking calls `onCell({ row, col })`.

`MatrixControls.tsx`:

- `SegmentedControl` **Win rate | Game points**; the points option is `disabled` when `!scoring.consistent || scoring.scale === null`, with a `Tooltip`/helper text "Events use different scoring" (or "No game points recorded" when scale is null and consistent);
- `NumberInput` **Min games** (min 1, max 50, default 3);
- `Select` **Disposition** ("All dispositions" placeholder, clearable, options = the five known names plus any others from the data, each rendered with `DispositionText` via `renderOption`);
- when a disposition is chosen, a `SegmentedControl` **Row side | Both sides** (`side`).

`CellDrawer.tsx`: a Mantine `Drawer` (position right) titled "Orks vs Necrons"; a table of games: event (cross-event only), round, table, row player (faction · `DispositionText`, team), outcome (W/L/D), points `12–8` (`formatPoints`), column player likewise. Loading / error / empty states.

`MatchupsPanel.tsx` (the event tab): holds `MatrixSettings` in state, loads `eventMatchupsQuery(event.bcpId, settings, event.pairings.queued > 0)`, renders `MatrixControls`, a one-line summary ("10 games · 6 factions" with numeric spans) and `FactionMatrix`; clicking a cell opens `CellDrawer` with `eventCellGamesQuery`. If the chosen metric is points and scoring becomes inconsistent, fall back to win rate. Empty state: "No games with known factions yet." Dispositions for the Select come from the loaded players (`playersQuery`) via the existing `dispositionsOf` helper.

Tests (`renderWithProviders`; stub `GET /api/events/EVT1/matchups…` and `/api/events/EVT1/players`):

- the matrix renders row/column headers and a cell's text ("50% · 3") with a tone class;
- a cell under `minGames` shows "·" and is not a button;
- the mirror cell shows only its count;
- the Game points option is disabled with "Events use different scoring" when `scoring.consistent` is false (Review Focus 2);
- choosing a disposition refetches with `disposition=…&side=row` (inspect the stubbed fetch URL);
- clicking a cell opens the drawer and lists its games (stub `…/matchups/games?row=…`).

- [ ] **Step 3: The event tab**

In `EventPage.tsx`, add `{ value: 'matchups', label: 'Matchups' }` to `EVENT_TABS` (after `standings`), available for both team and singles events (`tabsFor` keeps it for singles), and a panel:

```tsx
<Tabs.Panel value="matchups" pt="md">
  <PairingsGate event={detail}>
    <MatchupsPanel event={detail} />
  </PairingsGate>
</Tabs.Panel>
```

Extend the EventPage tab test: team events show Players & lists, Rounds, Standings, Matchups; singles show Players & lists, Rounds, Matchups.

- [ ] **Step 4: Run, check, commit**

Run: `pnpm vitest run --project web src/features/matchups src/features/event/EventPage.test.tsx`
Expected: PASS.

```bash
pnpm check
git add -A
git commit -m "feat(web): faction matchup matrix with drill-down on each event

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Web: the cross-event page, nav, e2e and README

**Files:**

- Create: `apps/web/src/routes/analysis.matchups.tsx`, `apps/web/src/features/matchups/MatchupsPage.tsx` (+ test), `apps/web/src/features/matchups/EventSelection.tsx` (+ test)
- Modify: `apps/web/src/features/matchups/matchups-queries.ts` (cross-event queries, bulk queue), `apps/web/src/components/AppLayout.tsx` (nav), `e2e/team-analysis.spec.ts`, `README.md`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces:
  - Route `/analysis/matchups` with search `{ from?: string; to?: string; exclude?: string; include?: string; metric?: 'winRate' | 'points'; minGames?: number; disposition?: string; side?: 'row' | 'both' }` (all optional; defaults from `DEFAULT_MATRIX_SETTINGS` and the API's 90-day range).
  - `crossMatchupsQuery(search)`, `crossCellGamesQuery(search, cell)`, `queueManyPairings(eventIds)`.

- [ ] **Step 1: Tests first** (Review Focus 4)

`EventSelection.test.tsx`:

- lists events with their date, size ("96 players · 12 teams"), pairings state badge text (Synced / Fetching / Partial / No pairings) and a checkbox reflecting `included`;
- toggling a synced event's checkbox calls `onChange` with it added to `exclude`; toggling a partial event adds it to `include`;
- "Sync pairings for N events" counts missing + partial events and posts their ids to `/api/pairings-queue`; with none it's not shown;
- empty range: "No team events in this range." text.

`MatchupsPage.test.tsx`:

- renders the date range inputs, the event list and the matrix from a stubbed `GET /api/matchups?...`;
- with no included events (or zero games) shows "Tick at least one event with pairings to see matchups." instead of an empty table;
- while any listed event is `fetching`, a progress line is shown (`aria-live`), and the query refetches (live).

- [ ] **Step 2: Implement**

`matchups-queries.ts` additions:

```ts
export interface CrossSearch {
  from?: string;
  to?: string;
  exclude?: string;
  include?: string;
  metric?: 'winRate' | 'points';
  minGames?: number;
  disposition?: string;
  side?: 'row' | 'both';
}

const crossParams = (search: CrossSearch) =>
  new URLSearchParams(
    Object.entries({
      from: search.from,
      to: search.to,
      exclude: search.exclude,
      include: search.include,
      disposition: search.disposition,
      side: search.disposition ? (search.side ?? 'row') : undefined,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  ).toString();

export const crossMatchupsQuery = (search: CrossSearch) =>
  queryOptions({
    queryKey: ['matchups', crossParams(search)],
    queryFn: () => apiGet(`/api/matchups?${crossParams(search)}`, CrossEventMatchupsResponseSchema),
    refetchInterval: (query) =>
      query.state.data?.events.some((e) => e.pairings === 'fetching') ? 5000 : false,
  });

export const crossCellGamesQuery = (search: CrossSearch, cell: { row: string; col: string }) =>
  queryOptions({
    queryKey: ['matchups', crossParams(search), 'games', cell.row, cell.col],
    queryFn: () =>
      apiGet(
        `/api/matchups/games?${crossParams(search)}&${new URLSearchParams(cell).toString()}`,
        CellGamesResponseSchema,
      ),
  });

export const queueManyPairings = (eventIds: string[]) =>
  apiPost('/api/pairings-queue', { eventIds }, BulkPairingsResultSchema);
```

`apps/web/src/routes/analysis.matchups.tsx`: `createFileRoute('/analysis/matchups')` with `validateSearch` (Zod, every key optional with `.catch(undefined)`-style fallbacks so bad URLs don't break the page), rendering `MatchupsPage` with `search` and `onSearchChange(next)` → `navigate({ search: next, replace: true })`. Run `pnpm --filter @bcp/web exec tsr generate` and commit `routeTree.gen.ts`.

`MatchupsPage.tsx`:

- Title "Faction matchups".
- `DatePickerInput type="range"` for from/to (use the draft-state pattern of `features/finder/AdvancedSearch.tsx` so picking works), defaulting to the last 90 days.
- `EventSelection` (events, exclude/include handling, the Sync button → `queueManyPairings(ids)` then invalidate `['matchups']` and `fetchQueueQuery`, and a notification from the result: "Queued N rounds for M events · about T").
- `MatrixControls` + summary + `FactionMatrix` + `CellDrawer` (as in `MatchupsPanel`, with the cross-event queries; the drawer shows the event name per game).
- Progress line while events are fetching: "Fetching pairings for N events…" (`aria-live="polite"`).
- Empty states per Review Focus 4.

`EventSelection.tsx`: a compact table/list (`Panel p={0}`) of events: checkbox (`aria-label` "Include <event name>"), name linking to the event page (`AnchorLink` to `/events/$eventId` with `search={{ tab: 'matchups' }}`), date, "N players · M teams", state text (Synced / Fetching / Partial / No pairings; Partial and No pairings dimmed). Above it the **Sync pairings for N events** button (only when N > 0).

Nav: in `apps/web/src/components/AppLayout.tsx` add `{ to: '/analysis/matchups', label: 'Matchups' }` between Tournaments and Settings (check the header still fits at 375 px; shorten or hide on xs like the queue indicator if needed).

- [ ] **Step 3: e2e**

Extend `e2e/team-analysis.spec.ts` after the standings/team steps: go back to the event, open the **Matchups** tab, expect a cell button (e.g. `page.getByRole('button', { name: /Space Marines vs/ })`) to be visible, click it, and expect the drawer to list a game (e.g. "Ada Archer"). Check the sample event's factions in `fixtures/bcp/sample/events/EVTTEAM0001/players.json` and use a faction pair that actually played; `minGames` defaults to 3, so either pick a pair with ≥ 3 games or set **Min games** to 1 in the test first.

Run: `pnpm e2e`
Expected: 2 passed.

- [ ] **Step 4: README**

Add to "Using it":

```markdown
- **Matchups** (on each event, and across events under **Matchups** in the header) shows how
  factions fare against each other: win rate (draws count half) or average game points, with a
  minimum-games filter and a disposition filter; click a cell for the games behind it. The
  cross-event page lists the team events in a date range; tick which count, and **Sync pairings
  for N events** fetches the missing ones in the background.
```

Remove the "Plan 5: faction matchups" bullet from `docs/backlog.md`'s "Next up", and add under "Next up": "**Detachments from lists.** Parse each fetched list's detachment(s) (GW app `… (N Detachment Points)`, `DETACHMENT:` headers, `Detachment(s):` templates; split two joined detachments only when both halves are known on their own), show them with factions and dispositions, and add a detachment filter to the matchups."

- [ ] **Step 5: Check and commit**

```bash
pnpm check
pnpm e2e
git add -A
git commit -m "feat(web): cross-event faction matchups with bulk pairings sync; e2e and README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
