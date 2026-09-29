# Player Rankings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank players across the last 12 months of big events by tournament points (5 best
results, placing × size), with a Players page, a player page and top-100 rank badges.

**Architecture:** Players get BCP's account id (`players.bcp_user_id`). A pure shared function
`computeRankings` scores counted results; the API loads counted results from Postgres and ranks on
request under `/api/rankings`. The web app adds two pages and a `RankBadge` fed by one cached
top-100 query.

**Tech Stack:** pnpm monorepo; Hono + Drizzle + Postgres/PGlite (`apps/api`); React 19 + Mantine 9

- TanStack Router/Query (`apps/web`); Zod 4 (`packages/shared`); Vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-player-rankings-design.md`

## Global Constraints

- No BCP requests in tests; no new BCP requests at all (spec §1: read what is stored).
- Counted event: `isBigEvent` + `eventPhase(...) === 'finished'` + start within the last 365 days.
- Placing score `(N − placing) / (N − 1)`, 1 when N = 1, clamped to 0–1; size factor
  `min(1, ln(players) / ln(100))`; event score `100 × placing score × size factor`.
- Points: sum of the 5 best event scores. Order: points desc, counted results desc, best score
  desc, name A→Z; ranks 1, 2, 3… with no shared ranks.
- Team events: the team's placing among placed teams, shared by every member; players = the
  event's player count.
- Top-100 badges; the web keeps the top-100 query 5 minutes.
- Commands: `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH` first; tests with
  `pnpm vitest run --project api|web|shared <path>`; full gate `pnpm check`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings made while planning (deviations from the spec's letter)

- API paths are `/api/rankings`, `/api/rankings/top`, `/api/rankings/:userId` (spec: `/api/players…`)
  because `/api/players/search` already exists. Web pages stay `/players` and `/players/$userId`.
- The account id backfill runs at startup as an idempotent `backfillPlayerUserIds` (next to
  `reparseLists`), not as SQL inside the migration, so it is testable and also repairs rows
  written by an older app version during a rolling deploy.
- The player page's List button links to the event page's shareable list URL
  (`/events/$eventId?tab=players&list=<playerId>`) instead of embedding the list dialog.
- Badges go where player names are listed: the event players table (singles and team events),
  Top lists and the Meta players drawer. The event teams table lists teams, not players, so it
  gets none.

## Review Focus

1. A player whose name changed between events: the page shows the newest counted event's name
   (Task 2 test "names a player by their newest counted result").
2. A team event with an unplaced team (placing null) must not count that team in N, nor score
   its members (Task 3 test "leaves out unplaced entries, and counts N from placed ones").
3. Searching with regex characters or `%` in the name must not break or widen the search: the
   search is a plain case-insensitive substring done in JS (Task 3 test "searches names as plain
   text").
4. An account in the ranking whose results are all older than 12 months disappears; its player
   page still answers with history and `rank: null` (Task 3 test "answers a player without
   counted results with rank null").
5. The badge query failing (API down) must not break the pages it sits on: `RankBadge` renders
   nothing without data (Task 6 test "renders nothing when the top ranks aren’t loaded").

---

### Task 1: Players carry their BCP account id

**Files:**

- Modify: `apps/api/src/bcp/raw.ts` (RawPlayer `user`), `apps/api/src/bcp/mappers.ts` (mapPlayer),
  `packages/shared/src/domain.ts` (PlayerSchema), `apps/api/src/db/schema.ts` (players),
  `apps/api/src/repo/participants.ts` (upsertPlayers), `apps/api/src/main.ts`
- Create: migration via drizzle-kit (`apps/api/drizzle/0012_player-user-id.sql` + snapshot),
  `apps/api/src/repo/player-accounts.ts`, `apps/api/src/repo/player-accounts.test.ts`
- Test: `apps/api/src/bcp/mappers.test.ts`

**Interfaces:**

- Produces: `Player.bcpUserId: string | null`; column `players.bcpUserId` (`bcp_user_id`,
  indexed); `backfillPlayerUserIds(db: Db): Promise<number>`.

- [ ] **Step 1: Failing mapper test** — in `mappers.test.ts` `describe('mapPlayer')`, add
      `bcpUserId: 'US-ADA'` to the first test's input `user` (`{ id: 'US-ADA', firstName: 'Ada',
lastName: 'Archer' }`) and to its expected object (`bcpUserId: 'US-ADA'`), and add:

```ts
it('has no account id when BCP hides the user', () => {
  const raw = parseBcp(RawPlayer, { id: 'P2', user: null }, 'test');
  expect(mapPlayer(raw, 'E1').bcpUserId).toBeNull();
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project api apps/api/src/bcp/mappers.test.ts` —
      Expected: FAIL (no `bcpUserId`).
- [ ] **Step 3: Implement** — `raw.ts`: `user: z.object({ id: z.string().nullish(), firstName:
z.string().nullish(), lastName: z.string().nullish() }).nullish()`. `domain.ts` PlayerSchema:
      `/** BCP's account id: the same person across events; null when BCP hides the user. */
bcpUserId: z.string().nullable(),`. `mappers.ts` mapPlayer: `bcpUserId: raw.user?.id ?? null,`.
      Fix every other `Player` literal the type checker reports (tests/helpers) by adding
      `bcpUserId: null`.
- [ ] **Step 4: Schema + migration** — `schema.ts` players: `bcpUserId: text('bcp_user_id'),`
      after `name`, and `index('players_user_idx').on(t.bcpUserId)`. Run
      `pnpm --filter @bcp/api exec drizzle-kit generate --name player-user-id`; Expected: a new
      `0012_player-user-id.sql` with `ADD COLUMN "bcp_user_id" text` and `CREATE INDEX`.
      `participants.ts` upsertPlayers: `bcpUserId: player.bcpUserId,`.
- [ ] **Step 5: Failing backfill test** — `player-accounts.test.ts`:

```ts
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { sampleSource } from '../test/helpers';
import { backfillPlayerUserIds } from './player-accounts';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await syncEvent({ db, source: sampleSource() }, 'EVTTEAM0001');
});

describe('backfillPlayerUserIds', () => {
  it('stores each player’s account id from their BCP data, once', async () => {
    await db.update(players).set({ bcpUserId: null });
    expect(await backfillPlayerUserIds(db)).toBe(8);
    const [ada] = await db.select().from(players).where(eq(players.id, 'PL-ADA'));
    expect(ada?.bcpUserId).toBe('US-ADA');
    expect(await backfillPlayerUserIds(db)).toBe(0);
  });

  it('leaves a player without an account id alone', async () => {
    await db
      .update(players)
      .set({ bcpUserId: null, raw: sql`${players.raw} - 'user'` })
      .where(eq(players.id, 'PL-ADA'));
    await backfillPlayerUserIds(db);
    const [ada] = await db.select().from(players).where(eq(players.id, 'PL-ADA'));
    expect(ada?.bcpUserId).toBeNull();
  });
});
```

- [ ] **Step 6: Run** it — Expected: FAIL (module missing).
- [ ] **Step 7: Implement** `player-accounts.ts`:

```ts
import { and, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { players } from '../db/schema';

const userIdOf = sql<string | null>`${players.raw} -> 'user' ->> 'id'`;

/**
 * Stores BCP's account id for players saved before it was kept (from their raw BCP data). Runs at
 * startup; returns how many players it filled in.
 */
export async function backfillPlayerUserIds(db: Db): Promise<number> {
  const updated = await db
    .update(players)
    .set({ bcpUserId: userIdOf })
    .where(and(isNull(players.bcpUserId), sql`${userIdOf} is not null`))
    .returning({ id: players.id });
  return updated.length;
}
```

`main.ts`, after the `reparseLists` lines:

```ts
const accounts = await backfillPlayerUserIds(database.db);
if (accounts > 0) logger.info({ accounts }, 'Stored players’ BCP account ids');
```

- [ ] **Step 8: Run** the two test files, then `pnpm vitest run --project api` — Expected: PASS.
- [ ] **Step 9: Commit** `feat: players keep their BCP account id`.

### Task 2: Shared scoring and ranking

**Files:**

- Create: `packages/shared/src/analysis/rankings.ts`, `packages/shared/src/analysis/rankings.test.ts`
- Modify: `packages/shared/src/analysis/index.ts` (`export * from './rankings';`)

**Interfaces:**

- Produces:

```ts
export interface RankingResult {
  userId: string;
  name: string;
  eventId: string;
  eventName: string;
  eventStart: string; // YYYY-MM-DD
  isTeamEvent: boolean;
  teamName: string | null;
  placing: number;
  field: number;
  players: number;
  faction: string | null;
}
export interface ScoredResult extends RankingResult {
  score: number;
  counts: boolean;
}
export interface RankedPlayer {
  rank: number;
  userId: string;
  name: string;
  points: number;
  counted: number;
  results: number;
  best: ScoredResult;
  factions: string[];
  scores: ScoredResult[]; // newest first
}
export const RANKING_BEST = 5;
export const RANKING_DAYS = 365;
export function placingScore(placing: number, field: number): number;
export function sizeFactor(players: number): number;
export function eventScore(result: Pick<RankingResult, 'placing' | 'field' | 'players'>): number;
export function rankingCutoff(today: Date): string; // YYYY-MM-DD, results must start after it
export function computeRankings(results: RankingResult[], today: Date): RankedPlayer[];
```

- [ ] **Step 1: Failing tests** — `rankings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  computeRankings,
  eventScore,
  placingScore,
  sizeFactor,
  type RankingResult,
} from './rankings';

const TODAY = new Date('2026-09-29T12:00:00Z');
const result = (overrides: Partial<RankingResult> = {}): RankingResult => ({
  userId: 'U1',
  name: 'Ada Archer',
  eventId: 'E1',
  eventName: 'London GT',
  eventStart: '2026-09-01',
  isTeamEvent: false,
  teamName: null,
  placing: 1,
  field: 100,
  players: 100,
  faction: 'Orks',
  ...overrides,
});

describe('scoring', () => {
  it('scores placing from 1 for first to 0 for last', () => {
    expect(placingScore(1, 100)).toBe(1);
    expect(placingScore(100, 100)).toBe(0);
    expect(placingScore(1, 1)).toBe(1);
    expect(placingScore(11, 21)).toBeCloseTo(0.5);
    expect(placingScore(30, 20)).toBe(0);
  });

  it('grows with event size, full from 100 players', () => {
    expect(sizeFactor(20)).toBeCloseTo(0.6505, 3);
    expect(sizeFactor(40)).toBeCloseTo(0.801, 3);
    expect(sizeFactor(100)).toBe(1);
    expect(sizeFactor(300)).toBe(1);
  });

  it('scores 100 for winning a 100-player event', () => {
    expect(eventScore({ placing: 1, field: 100, players: 100 })).toBe(100);
    expect(eventScore({ placing: 1, field: 20, players: 20 })).toBeCloseTo(65.05, 1);
  });
});

describe('computeRankings', () => {
  it('adds up each player’s 5 best results and ranks by points', () => {
    const ada = [100, 90, 80, 70, 60, 10].map((_, i) =>
      result({ eventId: `A${String(i)}`, placing: [1, 11, 21, 31, 41, 91][i] ?? 1 }),
    );
    const ben = [result({ userId: 'U2', name: 'Ben Brass', placing: 1 })];
    const [first, second] = computeRankings([...ada, ...ben], TODAY);
    expect(first).toMatchObject({ rank: 1, userId: 'U1', counted: 5, results: 6 });
    // 1st, 11th, 21st, 31st, 41st of 100: 100 + 89.9 + 79.8 + 69.7 + 59.6.
    expect(first?.points).toBeCloseTo(398.99, 1);
    expect(first?.scores.filter((s) => s.counts)).toHaveLength(5);
    expect(second).toMatchObject({ rank: 2, userId: 'U2', points: 100 });
  });

  it('counts only results from the last 12 months', () => {
    const ranked = computeRankings(
      [result({ eventStart: '2025-09-29' }), result({ eventId: 'E2', eventStart: '2025-09-30' })],
      TODAY,
    );
    expect(ranked[0]?.results).toBe(1);
  });

  it('breaks ties by more results, then best result, then name', () => {
    const ranked = computeRankings(
      [
        result({ userId: 'U1', name: 'Zed', placing: 51, field: 101 }), // 50
        result({ userId: 'U2', name: 'Amy', placing: 76, field: 101 }), // 25
        result({ userId: 'U2', name: 'Amy', eventId: 'E2', placing: 76, field: 101 }), // 25
        result({ userId: 'U3', name: 'Bob', placing: 51, field: 101 }), // 50
      ],
      TODAY,
    );
    expect(ranked.map((p) => p.name)).toEqual(['Amy', 'Bob', 'Zed']);
    expect(ranked.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it('names a player by their newest counted result, with their 2 most played factions', () => {
    const [ada] = computeRankings(
      [
        result({ name: 'Ada A.', eventStart: '2026-01-01', faction: 'Necrons' }),
        result({ eventId: 'E2', name: 'Ada Archer', eventStart: '2026-09-01' }),
        result({ eventId: 'E3', eventStart: '2026-05-01', faction: 'Orks' }),
        result({ eventId: 'E4', eventStart: '2026-04-01', faction: 'Tyranids' }),
        result({ eventId: 'E5', eventStart: '2026-03-01', faction: 'Tyranids' }),
      ],
      TODAY,
    );
    expect(ada?.name).toBe('Ada Archer');
    expect(ada?.factions).toEqual(['Orks', 'Tyranids']);
    expect(ada?.scores.map((s) => s.eventId)).toEqual(['E2', 'E3', 'E4', 'E5', 'E1']);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project shared packages/shared/src/analysis/rankings.test.ts`
      — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `rankings.ts`:

```ts
import { addDays } from '../catalog';

/** One counted result: a ranked player's placing at a counted event (spec §2). */
export interface RankingResult {
  userId: string;
  name: string;
  eventId: string;
  eventName: string;
  /** The event's first day (YYYY-MM-DD). */
  eventStart: string;
  isTeamEvent: boolean;
  teamName: string | null;
  /** The player's placing, or their team's at a team event. */
  placing: number;
  /** Placed entries: players, or teams at a team event. */
  field: number;
  /** The event's players (all team members at a team event). */
  players: number;
  faction: string | null;
}

export interface ScoredResult extends RankingResult {
  score: number;
  /** One of the player's RANKING_BEST best results, which make their points. */
  counts: boolean;
}

export interface RankedPlayer {
  rank: number;
  userId: string;
  name: string;
  points: number;
  /** Results making the points (at most RANKING_BEST). */
  counted: number;
  /** All counted results in the 12 months. */
  results: number;
  best: ScoredResult;
  /** Most played first, at most 2. */
  factions: string[];
  /** Newest first. */
  scores: ScoredResult[];
}

export const RANKING_BEST = 5;
export const RANKING_DAYS = 365;

/** 1 for first, 0 for last, evenly between; 1 when alone. */
export function placingScore(placing: number, field: number): number {
  if (field <= 1) return 1;
  return Math.min(1, Math.max(0, (field - placing) / (field - 1)));
}

/** Bigger events count more, fully from 100 players. */
export function sizeFactor(players: number): number {
  if (players <= 1) return 0;
  return Math.min(1, Math.log(players) / Math.log(100));
}

export function eventScore(result: Pick<RankingResult, 'placing' | 'field' | 'players'>): number {
  return 100 * placingScore(result.placing, result.field) * sizeFactor(result.players);
}

/** Results must start after this day (YYYY-MM-DD) to count. */
export function rankingCutoff(today: Date): string {
  return addDays(today.toISOString().slice(0, 10), -RANKING_DAYS);
}

/** Players by points: the sum of their RANKING_BEST best event scores of the last 12 months. */
export function computeRankings(results: RankingResult[], today: Date): RankedPlayer[] {
  const cutoff = rankingCutoff(today);
  const byPlayer = new Map<string, RankingResult[]>();
  for (const result of results) {
    if (result.eventStart <= cutoff) continue;
    byPlayer.set(result.userId, [...(byPlayer.get(result.userId) ?? []), result]);
  }
  const players = [...byPlayer.values()].map((own) => {
    const byScore = own
      .map((result) => ({ result, score: eventScore(result) }))
      .sort((a, b) => b.score - a.score || b.result.eventStart.localeCompare(a.result.eventStart));
    const counting = new Set(byScore.slice(0, RANKING_BEST).map((entry) => entry.result));
    const scores: ScoredResult[] = byScore
      .map(({ result, score }) => ({ ...result, score, counts: counting.has(result) }))
      .sort((a, b) => b.eventStart.localeCompare(a.eventStart) || b.score - a.score);
    const factionCounts = new Map<string, number>();
    for (const result of own) {
      if (result.faction !== null) {
        factionCounts.set(result.faction, (factionCounts.get(result.faction) ?? 0) + 1);
      }
    }
    const best = scores.reduce((top, s) => (s.score > top.score ? s : top));
    return {
      userId: best.userId,
      name: scores[0]?.name ?? best.name,
      points: scores.filter((s) => s.counts).reduce((sum, s) => sum + s.score, 0),
      counted: counting.size,
      results: own.length,
      best,
      factions: [...factionCounts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 2)
        .map(([faction]) => faction),
      scores,
    };
  });
  return players
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.results - a.results ||
        b.best.score - a.best.score ||
        a.name.localeCompare(b.name),
    )
    .map((player, index) => ({ rank: index + 1, ...player }));
}
```

Note: the tie test's "more results" is `results` (all counted results), matching the spec's
"more counted results".

- [ ] **Step 4: Run** the test — Expected: PASS. Then `pnpm vitest run --project shared`.
- [ ] **Step 5: Commit** `feat: rank players by their 5 best results of the last 12 months`.

### Task 3: Ranking data from the database

**Files:**

- Modify: `packages/shared/src/api.ts` (schemas below)
- Create: `apps/api/src/repo/rankings.ts`, `apps/api/src/repo/rankings.test.ts`

**Interfaces:**

- Consumes: `computeRankings`, `RankedPlayer`, `ScoredResult`, `rankingCutoff` (Task 2);
  `players.bcpUserId` (Task 1).
- Produces (shared `api.ts`):

```ts
export const RankingsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  faction: z.string().trim().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type RankingsQuery = z.infer<typeof RankingsQuerySchema>;
const RankedResultSchema = z.object({
  eventId: z.string(),
  eventName: z.string(),
  eventStart: z.iso.date(),
  isTeamEvent: z.boolean(),
  teamName: z.string().nullable(),
  placing: z.number().int(),
  field: z.number().int(),
  score: z.number(),
  counts: z.boolean(),
});
export const RankedPlayerSchema = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  name: z.string(),
  points: z.number(),
  counted: z.number().int(),
  results: z.number().int(),
  best: RankedResultSchema,
  factions: z.array(z.string()),
});
export type RankedPlayerRow = z.infer<typeof RankedPlayerSchema>;
export const RankingsResponseSchema = z.object({
  players: z.array(RankedPlayerSchema),
  /** Players matching the filters. */
  total: z.number().int().nonnegative(),
  /** All ranked players. */
  ranked: z.number().int().nonnegative(),
  /** Factions of ranked players (A→Z), for the filter. */
  factionOptions: z.array(z.string()),
});
export type RankingsResponse = z.infer<typeof RankingsResponseSchema>;
export const TopRanksSchema = z.object({ ranks: z.record(z.string(), z.number().int()) });
export type TopRanks = z.infer<typeof TopRanksSchema>;
export const PlayerHistoryEntrySchema = z.object({
  playerId: z.string(),
  eventId: z.string(),
  eventName: z.string(),
  eventStart: z.iso.date(),
  isTeamEvent: z.boolean(),
  teamName: z.string().nullable(),
  faction: z.string().nullable(),
  detachments: z.array(z.string()),
  placing: z.number().int().nullable(),
  field: z.number().int().nullable(),
  hasList: z.boolean(),
  /** Null when the event doesn't count (small, running, older than 12 months, no placing). */
  score: z.number().nullable(),
  counts: z.boolean(),
});
export const PlayerRankingSchema = z.object({
  userId: z.string(),
  name: z.string(),
  rank: z.number().int().positive().nullable(),
  ranked: z.number().int().nonnegative(),
  points: z.number(),
  /** When the oldest counted result drops out of the 12 months (YYYY-MM-DD). */
  dropsOn: z.iso.date().nullable(),
  history: z.array(PlayerHistoryEntrySchema),
});
export type PlayerRanking = z.infer<typeof PlayerRankingSchema>;
export const TOP_RANKS = 100;
```

- Produces (repo): `loadRankings(db, rule, today): Promise<RankedPlayer[]>`;
  `rankingsPage(ranked: RankedPlayer[], query: RankingsQuery): RankingsResponse`;
  `topRanks(ranked): TopRanks`; `playerRanking(db, ranked, userId, rule, today):
Promise<PlayerRanking | null>`.

- [ ] **Step 1: Failing repo tests** — `rankings.test.ts` (PGlite; both fixture events are
      finished team events of 2026 with 8 and 10 players):

```ts
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { events, players, teams } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { ALL_EVENTS, sampleSource } from '../test/helpers';
import { loadRankings, playerRanking, rankingsPage, topRanks } from './rankings';

const TODAY = new Date('2026-09-29T12:00:00Z');
let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await syncEvent({ db, source: sampleSource() }, 'EVTTEAM0001');
});

describe('loadRankings', () => {
  it('scores team events by the team’s placing, shared by its members', async () => {
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    // 4 placed teams, 8 players: TM-CHARLIE (1st) = 100 × 1 × ln 8 / ln 100.
    const top = ranked.slice(0, 2);
    expect(top.map((p) => p.userId).sort()).toEqual(['US-EVE', 'US-FINN']);
    expect(top[0]?.points).toBeCloseTo(45.15, 1);
    expect(ranked).toHaveLength(8);
  });

  it('leaves out unplaced entries, and counts N from placed ones', async () => {
    await db.update(teams).set({ placing: null }).where(eq(teams.id, 'TM-DELTA'));
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    expect(ranked.map((p) => p.userId)).not.toContain('US-GIA');
    // 3 placed teams now: TM-ALPHA (2nd) scores (3 − 2) / 2.
    expect(ranked.find((p) => p.userId === 'US-ADA')?.points).toBeCloseTo(45.15 / 2, 1);
  });

  it('counts only finished big events, and only players with an account', async () => {
    await db.update(players).set({ bcpUserId: null }).where(eq(players.id, 'PL-ADA'));
    expect((await loadRankings(db, ALL_EVENTS, TODAY)).map((p) => p.userId)).not.toContain(
      'US-ADA',
    );
    expect(await loadRankings(db, { minRounds: 3, minPlayers: 8 }, TODAY)).toEqual([]);
    await db.update(events).set({ ended: false, endDate: new Date('2026-10-01') });
    expect(await loadRankings(db, ALL_EVENTS, new Date('2026-03-28T12:00:00Z'))).toEqual([]);
  });
});

describe('rankingsPage', () => {
  it('searches names as plain text, filters by faction and pages, keeping ranks', async () => {
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    const page = rankingsPage(ranked, { search: 'ADA', offset: 0, limit: 100 });
    expect(page.players.map((p) => p.userId)).toEqual(['US-ADA']);
    expect(page.players[0]?.rank).toBe(ranked.find((p) => p.userId === 'US-ADA')?.rank);
    expect(rankingsPage(ranked, { search: '%', offset: 0, limit: 100 }).total).toBe(0);
    expect(rankingsPage(ranked, { search: '.*', offset: 0, limit: 100 }).total).toBe(0);
    const paged = rankingsPage(ranked, { offset: 2, limit: 3 });
    expect(paged.players.map((p) => p.rank)).toEqual([3, 4, 5]);
    expect(paged.total).toBe(8);
    const faction = ranked[0]?.factions[0];
    if (faction !== undefined) {
      const filtered = rankingsPage(ranked, { faction, offset: 0, limit: 100 });
      expect(filtered.players.every((p) => p.factions.includes(faction))).toBe(true);
    }
  });

  it('gives the top ranks by account', async () => {
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    const { ranks } = topRanks(ranked);
    expect(Object.keys(ranks)).toHaveLength(8);
    expect(ranks[ranked[0]?.userId ?? '']).toBe(1);
  });
});

describe('playerRanking', () => {
  it('gives a player’s rank, points and history with the counted results marked', async () => {
    await syncEvent({ db, source: sampleSource() }, 'EVTBRACKET01');
    await db.update(players).set({ bcpUserId: 'US-ADA' }).where(eq(players.id, 'PB-R1'));
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    const ada = await playerRanking(db, ranked, 'US-ADA', ALL_EVENTS, TODAY);
    expect(ada?.history.map((h) => h.eventId)).toEqual(['EVTBRACKET01', 'EVTTEAM0001']);
    expect(ada?.history.every((h) => h.counts && h.score !== null)).toBe(true);
    expect(ada?.rank).toBe(ranked.findIndex((p) => p.userId === 'US-ADA') + 1);
    expect(ada?.dropsOn).toBe('2027-03-28');
  });

  it('answers a player without counted results with rank null', async () => {
    await db.update(events).set({ startDate: new Date('2025-01-01') });
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    const ada = await playerRanking(db, ranked, 'US-ADA', ALL_EVENTS, TODAY);
    expect(ada).toMatchObject({ rank: null, points: 0, dropsOn: null });
    expect(ada?.history[0]).toMatchObject({ score: null, counts: false });
    expect(await playerRanking(db, ranked, 'US-NOBODY', ALL_EVENTS, TODAY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project api apps/api/src/repo/rankings.test.ts` —
      Expected: FAIL (module missing). Add the schemas to `api.ts` first so imports resolve.
- [ ] **Step 3: Implement** `rankings.ts`:

```ts
import {
  addDays,
  computeRankings,
  countedFaction,
  eventPhase,
  isBigEvent,
  rankingCutoff,
  RANKING_DAYS,
  TOP_RANKS,
  type EventSizeRule,
  type PlayerRanking,
  type RankedPlayer,
  type RankingResult,
  type RankingsQuery,
  type RankingsResponse,
  type TopRanks,
} from '@bcp/shared';
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, events, players, teams } from '../db/schema';
import { storedCurrentList } from './lists';

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** The counted events of the last 12 months: big and finished. */
async function countedEvents(db: Db, rule: EventSizeRule, today: Date) {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      startDate: events.startDate,
      endDate: events.endDate,
      ended: events.ended,
      roundCount: events.roundCount,
      playerCount: events.playerCount,
      isTeamEvent: events.isTeamEvent,
    })
    .from(events)
    .where(gt(events.startDate, new Date(`${rankingCutoff(today)}T23:59:59.999Z`)));
  return rows.filter((event) => isBigEvent(event, rule) && eventPhase(event, today) === 'finished');
}

/** Placed entries per event: players at singles events, teams at team events. */
async function fields(db: Db, ids: string[]) {
  const [playerCounts, teamCounts] = await Promise.all([
    db
      .select({ eventId: players.eventId, n: sql<number>`count(*)::int` })
      .from(players)
      .where(and(inArray(players.eventId, ids), isNotNull(players.placing)))
      .groupBy(players.eventId),
    db
      .select({ eventId: teams.eventId, n: sql<number>`count(*)::int` })
      .from(teams)
      .where(and(inArray(teams.eventId, ids), isNotNull(teams.placing)))
      .groupBy(teams.eventId),
  ]);
  return {
    singles: new Map(playerCounts.map((row) => [row.eventId, row.n])),
    teams: new Map(teamCounts.map((row) => [row.eventId, row.n])),
  };
}

const resultColumns = {
  playerId: players.id,
  userId: players.bcpUserId,
  name: players.name,
  eventId: players.eventId,
  playerPlacing: players.placing,
  teamName: teams.name,
  teamPlacing: teams.placing,
  faction: players.faction,
  parsedArmy: armyLists.parsedArmy,
  detachments: armyLists.detachments,
  storedListId: armyLists.listId,
};

/** Every ranked player, best first (spec §3). */
export async function loadRankings(
  db: Db,
  rule: EventSizeRule,
  today: Date,
): Promise<RankedPlayer[]> {
  const counted = await countedEvents(db, rule, today);
  if (counted.length === 0) return [];
  const ids = counted.map((event) => event.id);
  const byId = new Map(counted.map((event) => [event.id, event]));
  const [rows, field] = await Promise.all([
    db
      .select(resultColumns)
      .from(players)
      .leftJoin(teams, eq(teams.id, players.teamId))
      .leftJoin(armyLists, storedCurrentList)
      .where(and(inArray(players.eventId, ids), isNotNull(players.bcpUserId))),
    fields(db, ids),
  ]);
  const results: RankingResult[] = rows.flatMap((row) => {
    const event = byId.get(row.eventId);
    if (event === undefined || row.userId === null) return [];
    const placing = event.isTeamEvent ? row.teamPlacing : row.playerPlacing;
    const n = (event.isTeamEvent ? field.teams : field.singles).get(event.id) ?? 0;
    if (placing === null || n === 0) return [];
    return [
      {
        userId: row.userId,
        name: row.name,
        eventId: event.id,
        eventName: event.name,
        eventStart: isoDay(event.startDate),
        isTeamEvent: event.isTeamEvent,
        teamName: event.isTeamEvent ? row.teamName : null,
        placing,
        field: n,
        players: event.playerCount,
        faction: countedFaction(row.faction, row.parsedArmy).faction,
      },
    ];
  });
  return computeRankings(results, today);
}

const withoutScores = ({ scores: _scores, best, ...player }: RankedPlayer) => ({
  ...player,
  best: {
    eventId: best.eventId,
    eventName: best.eventName,
    eventStart: best.eventStart,
    isTeamEvent: best.isTeamEvent,
    teamName: best.teamName,
    placing: best.placing,
    field: best.field,
    score: best.score,
    counts: best.counts,
  },
});

/** A page of the ranking, filtered by name (plain, case-insensitive) and faction. */
export function rankingsPage(ranked: RankedPlayer[], query: RankingsQuery): RankingsResponse {
  const search = query.search?.toLowerCase() ?? '';
  const matching = ranked.filter(
    (player) =>
      (search === '' || player.name.toLowerCase().includes(search)) &&
      (query.faction === undefined ||
        player.scores.some((score) => score.faction === query.faction)),
  );
  return {
    players: matching.slice(query.offset, query.offset + query.limit).map(withoutScores),
    total: matching.length,
    ranked: ranked.length,
    factionOptions: [
      ...new Set(ranked.flatMap((p) => p.scores.flatMap((s) => (s.faction ? [s.faction] : [])))),
    ].sort((a, b) => a.localeCompare(b)),
  };
}

export function topRanks(ranked: RankedPlayer[]): TopRanks {
  return {
    ranks: Object.fromEntries(ranked.slice(0, TOP_RANKS).map((p) => [p.userId, p.rank])),
  };
}

/** A player's rank and every event they played, counted or not; null for an unknown account. */
export async function playerRanking(
  db: Db,
  ranked: RankedPlayer[],
  userId: string,
  rule: EventSizeRule,
  today: Date,
): Promise<PlayerRanking | null> {
  const rows = await db
    .select({
      ...resultColumns,
      eventName: events.name,
      startDate: events.startDate,
      isTeamEvent: events.isTeamEvent,
    })
    .from(players)
    .innerJoin(events, eq(events.id, players.eventId))
    .leftJoin(teams, eq(teams.id, players.teamId))
    .leftJoin(armyLists, storedCurrentList)
    .where(eq(players.bcpUserId, userId))
    .orderBy(sql`${events.startDate} desc`);
  if (rows.length === 0) return null;
  const field = await fields(db, [...new Set(rows.map((row) => row.eventId))]);
  const own = ranked.find((player) => player.userId === userId);
  const scores = new Map(own?.scores.map((score) => [score.eventId, score]));
  const counting = own?.scores.filter((score) => score.counts) ?? [];
  const oldest = counting.map((score) => score.eventStart).sort()[0];
  return {
    userId,
    name: own?.name ?? rows[0]?.name ?? '',
    rank: own?.rank ?? null,
    ranked: ranked.length,
    points: own?.points ?? 0,
    dropsOn: oldest === undefined ? null : addDays(oldest, RANKING_DAYS),
    history: rows.map((row) => {
      const score = scores.get(row.eventId);
      const placing = row.isTeamEvent ? row.teamPlacing : row.playerPlacing;
      const n = (row.isTeamEvent ? field.teams : field.singles).get(row.eventId) ?? null;
      return {
        playerId: row.playerId,
        eventId: row.eventId,
        eventName: row.eventName,
        eventStart: isoDay(row.startDate),
        isTeamEvent: row.isTeamEvent,
        teamName: row.isTeamEvent ? row.teamName : null,
        faction: countedFaction(row.faction, row.parsedArmy).faction,
        detachments: row.detachments ?? [],
        placing,
        field: placing === null ? null : n,
        hasList: row.storedListId !== null,
        score: score?.score ?? null,
        counts: score?.counts ?? false,
      };
    }),
  };
}
```

(`rule` is unused in `playerRanking` beyond the signature; drop the parameter if lint objects
and update the test calls.) `dropsOn` for ADA: oldest counted 2026-03-28 + 365 = 2027-03-28.

- [ ] **Step 4: Run** the test file — Expected: PASS; then `pnpm vitest run --project api`.
- [ ] **Step 5: Commit** `feat: load player rankings and histories from stored results`.

### Task 4: Rankings API

**Files:**

- Create: `apps/api/src/routes/rankings.ts`, `apps/api/src/routes/rankings.test.ts`
- Modify: `apps/api/src/app.ts` (register after `playersSearchRoutes`)

**Interfaces:**

- Consumes: Task 3 repo functions and schemas.
- Produces: `GET /api/rankings` → `RankingsResponse`; `GET /api/rankings/top` → `TopRanks`;
  `GET /api/rankings/:userId` → `PlayerRanking` or 404 `NOT_FOUND`.

- [ ] **Step 1: Failing route tests** — copy the `createApp` setup from
      `routes/meta.test.ts` (now `2026-09-29T12:00:00Z`, `syncEvent(..., 'EVTTEAM0001')`), then:

```ts
describe('GET /api/rankings', () => {
  it('answers with ranked players, filters and paging', async () => {
    const body = (await (await app.request('/api/rankings?limit=3')).json()) as RankingsResponse;
    expect(body.players.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(body).toMatchObject({ total: 8, ranked: 8 });
    const ada = (await (await app.request('/api/rankings?search=ada')).json()) as RankingsResponse;
    expect(ada.players.map((p) => p.userId)).toEqual(['US-ADA']);
  });

  it('validates its input', async () => {
    expect((await app.request('/api/rankings?limit=0')).status).toBe(400);
  });

  it('gives the top ranks, and one player', async () => {
    const top = (await (await app.request('/api/rankings/top')).json()) as TopRanks;
    expect(Object.keys(top.ranks)).toHaveLength(8);
    const ada = (await (await app.request('/api/rankings/US-ADA')).json()) as PlayerRanking;
    expect(ada.history).toHaveLength(1);
    expect((await app.request('/api/rankings/US-NOBODY')).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run --project api apps/api/src/routes/rankings.test.ts` —
      Expected: FAIL (404s).
- [ ] **Step 3: Implement** `routes/rankings.ts`:

```ts
import { RankingsQuerySchema, type EventSizeRule } from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { loadRankings, playerRanking, rankingsPage, topRanks } from '../repo/rankings';
import { parseInput } from '../validation';

/** Players ranked by tournament points (see the player rankings spec). */
export function rankingsRoutes(deps: { db: Db; eventRule: EventSizeRule; now: () => Date }) {
  const ranked = () => loadRankings(deps.db, deps.eventRule, deps.now());
  return new Hono()
    .get('/rankings', async (c) =>
      c.json(rankingsPage(await ranked(), parseInput(RankingsQuerySchema, c.req.query()))),
    )
    .get('/rankings/top', async (c) => c.json(topRanks(await ranked())))
    .get('/rankings/:userId', async (c) => {
      const player = await playerRanking(
        deps.db,
        await ranked(),
        c.req.param('userId'),
        deps.eventRule,
        deps.now(),
      );
      if (player === null) throw new NotFoundError('No player with that account');
      return c.json(player);
    });
}
```

(Check `errors.ts` for the not-found class's exact name/constructor and use it.) In `app.ts`:
`app.route('/api', rankingsRoutes({ ...deps, now }));` after the players-search line.

- [ ] **Step 4: Run** — Expected: PASS; then `pnpm vitest run --project api`.
- [ ] **Step 5: Commit** `feat: /api/rankings, its top ranks and each player’s ranking`.

### Task 5: Account ids on listed players

**Files:**

- Modify: `packages/shared/src/api.ts` (EventPlayerSchema), `apps/api/src/repo/participants.ts`
  (listEventPlayers), `apps/api/src/repo/top-lists.ts` (row select + result),
  `apps/web/src/test/sample-data.ts` (aPlayer)
- Test: `apps/api/src/repo/participants.test.ts`

**Interfaces:**

- Produces: `EventPlayer.bcpUserId: string | null` (so also `TopListPlayer.bcpUserId`).

- [ ] **Step 1: Failing test** — in `participants.test.ts`, in the test that lists an event's
      players, add `expect(items.find((p) => p.bcpId === 'PL-ADA')?.bcpUserId).toBe('US-ADA');`
      (use the test's existing variable name for the listed players).
- [ ] **Step 2: Run** it — Expected: FAIL.
- [ ] **Step 3: Implement** — EventPlayerSchema: `/** BCP's account id, for the player's
ranking; null when hidden. */ bcpUserId: z.string().nullable(),` after `name`.
      listEventPlayers: `bcpUserId: player.bcpUserId,`. top-lists: select `bcpUserId:
players.bcpUserId` and map `bcpUserId: row.bcpUserId,`. Web `aPlayer`: `bcpUserId: null,`.
      Fix any other literal the type checker reports.
- [ ] **Step 4: Run** `pnpm check` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: listed players carry their BCP account id`.

### Task 6: Rank badges

**Files:**

- Create: `apps/web/src/features/rankings/rankings-queries.ts`,
  `apps/web/src/features/rankings/RankBadge.tsx`, `apps/web/src/features/rankings/RankBadge.test.tsx`
- Modify: `apps/web/src/features/event/PlayersPanel.tsx` (name cell, ~line 103),
  `apps/web/src/features/top-lists/TopListsPage.tsx` (~line 194),
  `apps/web/src/features/meta/MetaPlayersDrawer.tsx` (~line 111)
- Test: `apps/web/src/features/event/PlayersPanel.test.tsx`

**Interfaces:**

- Consumes: `TopRanksSchema`, `RankingsResponseSchema`, `PlayerRankingSchema`, `RankingsQuery`.
- Produces: `topRanksQuery`, `rankingsQuery(query)`, `playerRankingQuery(userId)`;
  `<RankBadge userId={string | null} />`.

- [ ] **Step 1: Failing tests** — `RankBadge.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { RankBadge } from './RankBadge';

describe('RankBadge', () => {
  it('shows a top player’s rank, linking to their page', async () => {
    stubFetchRoutes({ 'GET /api/rankings/top': { ranks: { 'US-ADA': 12 } } });
    renderWithRouter(<RankBadge userId="US-ADA" />);
    const badge = await screen.findByRole('link', { name: 'Ranked #12' });
    expect(badge).toHaveAttribute('href', '/players/US-ADA');
  });

  it('shows nothing for other players, or without an account', async () => {
    stubFetchRoutes({ 'GET /api/rankings/top': { ranks: { 'US-ADA': 12 } } });
    renderWithRouter(
      <>
        <RankBadge userId="US-BEN" />
        <RankBadge userId={null} />
        <span>done</span>
      </>,
    );
    await screen.findByText('done');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing when the top ranks aren’t loaded', async () => {
    stubFetchRoutes({});
    renderWithRouter(<RankBadge userId="US-ADA" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
```

In `PlayersPanel.test.tsx`, add a test rendering the panel with
`aPlayer({ bcpUserId: 'US-ADA' })` and the route `'GET /api/rankings/top': { ranks:
  { 'US-ADA': 3 } }`, expecting `await screen.findByRole('link', { name: 'Ranked #3' })` (reuse
that file's existing render setup and routes).

- [ ] **Step 2: Run** `pnpm vitest run --project web apps/web/src/features/rankings
apps/web/src/features/event/PlayersPanel.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `rankings-queries.ts`:

```ts
import {
  PlayerRankingSchema,
  RankingsResponseSchema,
  TopRanksSchema,
  type RankingsQuery,
} from '@bcp/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

export const topRanksQuery = queryOptions({
  queryKey: ['rankings', 'top'],
  queryFn: () => apiGet('/api/rankings/top', TopRanksSchema),
  staleTime: 5 * 60_000,
  retry: false,
});

export const rankingsQuery = (query: Partial<RankingsQuery>) => {
  const params = new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value === undefined || value === '' ? [] : [[key, String(value)]],
    ),
  ).toString();
  return queryOptions({
    queryKey: ['rankings', params],
    queryFn: () => apiGet(`/api/rankings${params ? `?${params}` : ''}`, RankingsResponseSchema),
    placeholderData: keepPreviousData,
  });
};

export const playerRankingQuery = (userId: string) =>
  queryOptions({
    queryKey: ['rankings', 'player', userId],
    queryFn: () => apiGet(`/api/rankings/${encodeURIComponent(userId)}`, PlayerRankingSchema),
  });
```

`RankBadge.tsx`:

```tsx
import { Badge } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { createLink } from '@tanstack/react-router';
import { topRanksQuery } from './rankings-queries';

const BadgeLink = createLink(Badge);

/** "#12" next to a top-100 player's name, linking to their page; nothing for anyone else. */
export function RankBadge({ userId }: { userId: string | null }) {
  const { data } = useQuery({ ...topRanksQuery, enabled: userId !== null });
  const rank = userId === null ? undefined : data?.ranks[userId];
  if (userId === null || rank === undefined) return null;
  return (
    <BadgeLink
      to="/players/$userId"
      params={{ userId }}
      size="xs"
      variant="light"
      color="neon"
      ml={6}
      aria-label={`Ranked #${String(rank)}`}
      style={{ cursor: 'pointer', verticalAlign: 'middle' }}
    >
      #{rank}
    </BadgeLink>
  );
}
```

Then place `<RankBadge userId={player.bcpUserId} />` right after the name text in the three
components (inside the same `Text`/cell, so it sits on the name's line; for `TopListsPage`
and `MetaPlayersDrawer` change `<Text size="sm">{player.name}</Text>` to
`<Text size="sm">{player.name}<RankBadge userId={player.bcpUserId} /></Text>`). The route
`/players/$userId` only exists after Task 8: add Task 8's route file stub now if the type
check needs it, or run this task's type check after Task 8 (record the choice as a ruling).

- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat: rank badges for top-100 players in players tables`.

### Task 7: Players page

**Files:**

- Create: `apps/web/src/features/rankings/PlayersPage.tsx`,
  `apps/web/src/features/rankings/PlayersPage.test.tsx`, `apps/web/src/routes/players.tsx`
- Modify: `apps/web/src/components/AppLayout.tsx` (NAV_ITEMS: `{ to: '/players', label:
'Players' }` after Factions), `apps/web/src/routeTree.gen.ts` (regenerated)

**Interfaces:**

- Consumes: `rankingsQuery`, `RankingsResponse`, `RankedPlayerRow`.
- Produces: `PlayersPage({ search: { q?: string; faction?: string }, onSearchChange })`.

- [ ] **Step 1: Failing tests** — `PlayersPage.test.tsx` with a `response(players, overrides)`
      helper building `RankingsResponse`, and ranked rows like
      `{ rank: 1, userId: 'US-ADA', name: 'Ada Archer', points: 412.3, counted: 5, results: 8,
best: { eventId: 'E1', eventName: 'London GT', eventStart: '2026-09-01', isTeamEvent: false,
teamName: null, placing: 1, field: 96, score: 98, counts: true }, factions: ['Orks'] }`:
  - shows rows in a table named "Players": rank "1", a link "Ada Archer" to `/players/US-ADA`,
    "412.3", "5 of 8", "1st of 96 · London GT", "Orks"; team best shows "2nd of 20 teams · …";
  - typing "ada" in the "Search players" box calls `onSearchChange({ q: 'ada' })`;
  - with `total: 150` and 100 rows, a "Show more" button asks for `limit=200` (assert the fetch
    URL contains `limit=200`);
  - `players: [], total: 0, ranked: 0` shows "No ranked players yet: rankings need finished big
    events of the last 12 months."
- [ ] **Step 2: Run** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** — Title "Players"; explanation `Text` (spec §4 wording); a
      `TextInput` labelled "Search players" (value `search.q`, `onChange` → `onSearchChange({ ...search,
q: value || undefined })`), a `Select` labelled "Faction" (clearable, data =
      `factionOptions`); `useState(100)` limit reset when filters change (key the component on
      `q|faction` from the route); `useQuery(rankingsQuery({ search: q, faction, limit }))`;
      a `Table aria-label="Players"` with columns Rank, Player (`AnchorLink to="/players/$userId"`),
      Points (`toFixed(1)`), Events (`${counted} of ${results}`), Best result
      (`${ordinal(placing)} of ${field}${isTeamEvent ? ' teams' : ''} · ${eventName}`), Factions
      (`factions.join(', ')`); columns sortable with `useTableSort` (default none = rank order);
      "Show more" button when `players.length < total`, setting `limit + 100`. Add to
      `apps/web/src/lib/format.ts`:

```ts
/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${String(n)}${suffix}`;
}
```

with a test in `lib/format.test.ts` (1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 112th).
Route `routes/players.tsx`: `validateSearch` with `q: z.string().trim().max(100).optional()
  .catch(undefined)`, `faction` likewise; navigate with `replace: true` (as `analysis.meta.tsx`).
Regenerate the route tree: `pnpm --filter web exec tsr generate`.

- [ ] **Step 4: Run** the tests, then `pnpm check` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: a Players page ranking players by tournament points`.

### Task 8: Player page

**Files:**

- Create: `apps/web/src/features/rankings/PlayerPage.tsx`,
  `apps/web/src/features/rankings/PlayerPage.test.tsx`, `apps/web/src/routes/players.$userId.tsx`

**Interfaces:**

- Consumes: `playerRankingQuery`, `PlayerRanking`, `ordinal`.
- Produces: `PlayerPage({ userId })`.

- [ ] **Step 1: Failing tests** — stub `GET /api/rankings/US-ADA` with a `PlayerRanking` of two
      history rows (one counted singles result 1st of 96 with score 98.0 and `hasList: true`, one
      uncounted team result `score: null`), rank 12, ranked 3456, points 412.3, dropsOn
      '2027-03-28':
  - heading "Ada Archer"; text "#12 of 3,456 · 412.3 points"; "Oldest counted result drops out
    on 28 Mar 2027";
  - a table named "History": first row has link "London GT" to
    `/events/E1?tab=players`, "1st of 96", "98.0", an accessible "Counts" mark and a "List" link
    to `/events/E1?tab=players&list=PL-ADA`; the second row has `data-counted="false"` and "–"
    as its score;
  - a 404 shows "No player with that account." (stub the route with status 404 using the
    helper's error form — check `stubFetchRoutes` for how errors are stubbed).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — Title = name; line `#${rank} of ${ranked.toLocaleString('en-GB')}
· ${points.toFixed(1)} points` (or "Not ranked: no counted results in the last 12 months"
      when `rank` is null); drops line via `formatIsoDay(dropsOn)`; `Table aria-label="History"`
      with Date (`formatIsoDay`), Event (`AnchorLink to="/events/$eventId" search={{ tab: 'players'
}}`), Team, Faction + detachments (`faction · detachments.join(' + ')`), Placing
      (`${ordinal(placing)} of ${field}${isTeamEvent ? ' teams' : ''}` or "–"), Score
      (`toFixed(1)` or "–"), Counts (a check mark with `aria-label="Counts"` when `counts`), and a
      "List" `AnchorLink` with `search={{ tab: 'players', list: playerId }}` when `hasList`. Rows
      with `score === null` get `data-counted="false"` and dimmed text. Errors: `ErrorState`, but a
      404 (`ApiError` status 404) shows "No player with that account.". Route file
      `players.$userId.tsx` with `createFileRoute('/players/$userId')` rendering
      `<PlayerPage userId={Route.useParams().userId} />`. Regenerate the route tree.
- [ ] **Step 4: Run** the tests, then `pnpm check` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: a player page with their ranking and history`.

### Task 9: End-to-end check in the browser

- [ ] **Step 1:** Temporarily point `.claude/launch.json`'s api at the local database
      (`DATABASE_URL=postgres://bcp:bcp@localhost:5434/bcp`, fixtures source), start `api` and
      `web` with preview_start, restore `launch.json` immediately after the servers start.
- [ ] **Step 2:** Open `/players`: rows load, search and faction filter work, a name opens the
      player page, the List link opens the list; `/analysis/top-lists` shows badges. Check the
      header still fits at 1200 px with eight links (if not, move the nav breakpoint to `xl`).
- [ ] **Step 3:** Stop both servers. Screenshot for the user.
