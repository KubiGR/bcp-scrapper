# Team Pairings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Pairings page for a 5-player team event: the team rates each game with a chip, and the page shows the expected team score, the round-1 defender grid and, as a flow diagram, every chain of pairing decisions down to the final line-up.

**Architecture:** A pure pairing solver in `packages/shared/src/pairing/` (exact zero-sum matrix games, solved backwards through the 5-player procedure) that runs in the browser. The API only stores the chips in a new `pairing_ratings` table and serves both rosters. The web page lives under the team page and draws the chain as an SVG flow diagram.

**Tech Stack:** TypeScript, Zod 4, Hono + Drizzle (Postgres/PGlite), React 19 + Mantine 9 + TanStack Query/Router, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-08-team-pairings-design.md`

## Global Constraints

- Node: `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH` before any pnpm command.
- Tests: `pnpm vitest run --project shared|api|web <path>`; full gate: `pnpm check` (lint, typecheck, all tests) must pass before each commit, with no "×" in its output.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch `feat/team-pairings`; never merge to main without the user's "merge".
- Chip points: BOUYA 20, GG 17, G 13, Y 10, R 7, RR 2.5, F 10. Colours: BOUYA cyan, GG blue, G green, Y yellow, R orange, RR red, F purple.
- Scores are labelled "Expected team score (of 100)"; 50 is even.
- Unrated games count as Y (10); the page shows "N of 25 rated".
- 5-player teams only; anything else shows which team and how many players, no analysis.
- Opponents value a game as `20 − ours`.
- Chain branches below 2% of their parent are folded into "other".
- The page refetches ratings every 10 seconds and on focus; a rating saves on click, last change wins.
- No BCP network requests in tests.

## Review Focus

1. A team with dropped players: only players who haven't dropped count toward the 5 (Task 5 test "leaves out dropped players").
2. Degenerate rating matrices (every game equal, whole rows equal) must solve without looping and give 50 when all are 10 (Task 1 and Task 2 tests).
3. A rating for a player who isn't on that team, or a team against itself, is refused with 400 (Task 5 tests).
4. Clearing a chip (null) removes the stored rating, and the cell goes back to "unrated" (Task 5 and Task 6 tests).
5. Two teammates editing at once: the page polls every 10 seconds, so the other edit appears (Task 6 test checks the query's `refetchInterval` is 10 000).

---

### Task 1: Chip scale and the matrix-game solver

**Files:**

- Create: `packages/shared/src/pairing/scale.ts`
- Create: `packages/shared/src/pairing/matrix-game.ts`
- Create: `packages/shared/src/pairing/index.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './pairing';`)
- Test: `packages/shared/src/pairing/matrix-game.test.ts`, `packages/shared/src/pairing/scale.test.ts`

**Interfaces:**

- Produces: `PAIRING_CHIPS`, `type PairingChip`, `CHIP_POINTS: Record<PairingChip, number>`, `CHIP_COLOURS`, `UNRATED_POINTS = 10`, `pointsMatrix(ourIds: string[], theirIds: string[], ratings: { playerId: string; opponentPlayerId: string; chip: PairingChip }[]): { points: number[][]; rated: number }`, `solveMatrixGame(a: number[][]): { value: number; rows: number[]; cols: number[] }` (rows maximise).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/pairing/matrix-game.test.ts
import { describe, expect, it } from 'vitest';
import { solveMatrixGame } from './matrix-game';

const close = (a: number, b: number) => {
  expect(a).toBeCloseTo(b, 9);
};

describe('solveMatrixGame', () => {
  it('matching pennies: value 0, both play 50/50', () => {
    const s = solveMatrixGame([
      [1, -1],
      [-1, 1],
    ]);
    close(s.value, 0);
    s.rows.forEach((p) => close(p, 0.5));
    s.cols.forEach((p) => close(p, 0.5));
  });

  it('rock-paper-scissors: thirds', () => {
    const s = solveMatrixGame([
      [0, -1, 1],
      [1, 0, -1],
      [-1, 1, 0],
    ]);
    close(s.value, 0);
    s.rows.forEach((p) => close(p, 1 / 3));
  });

  it('a dominant row is played for sure', () => {
    const s = solveMatrixGame([
      [3, 5],
      [1, 2],
    ]);
    close(s.value, 3);
    expect(s.rows).toEqual([1, 0]);
  });

  it('a 1 x N game: the column player picks the lowest', () => {
    close(solveMatrixGame([[4, 2, 9]]).value, 2);
  });

  it('every entry equal: solves, value is that entry', () => {
    close(
      solveMatrixGame([
        [10, 10],
        [10, 10],
      ]).value,
      10,
    );
  });
});
```

```ts
// packages/shared/src/pairing/scale.test.ts
import { describe, expect, it } from 'vitest';
import { CHIP_POINTS, pointsMatrix } from './scale';

describe('pointsMatrix', () => {
  it('reads chips into points, unrated games as Y (10), and counts the rated ones', () => {
    const { points, rated } = pointsMatrix(
      ['a', 'b'],
      ['x', 'y'],
      [
        { playerId: 'a', opponentPlayerId: 'y', chip: 'RR' },
        { playerId: 'b', opponentPlayerId: 'x', chip: 'BOUYA' },
      ],
    );
    expect(points).toEqual([
      [10, 2.5],
      [20, 10],
    ]);
    expect(rated).toBe(2);
    expect(CHIP_POINTS.GG).toBe(17);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run --project shared packages/shared/src/pairing`
Expected: FAIL, cannot resolve `./matrix-game` and `./scale`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/pairing/scale.ts
/** The rating chips, best first, as the team's sheet uses them. */
export const PAIRING_CHIPS = ['BOUYA', 'GG', 'G', 'Y', 'R', 'RR', 'F'] as const;
export type PairingChip = (typeof PAIRING_CHIPS)[number];

/** Points out of 20 for our player; F (either way) counts as even. */
export const CHIP_POINTS: Record<PairingChip, number> = {
  BOUYA: 20,
  GG: 17,
  G: 13,
  Y: 10,
  R: 7,
  RR: 2.5,
  F: 10,
};

export const CHIP_COLOURS: Record<PairingChip, string> = {
  BOUYA: '#00e5ff',
  GG: '#1155cc',
  G: '#38761d',
  Y: '#ffd966',
  R: '#e69138',
  RR: '#cc0000',
  F: '#674ea7',
};

/** A game nobody has rated yet counts as even. */
export const UNRATED_POINTS = 10;

/** The ratings as points, ours (rows) against theirs (columns), and how many games are rated. */
export function pointsMatrix(
  ourIds: string[],
  theirIds: string[],
  ratings: { playerId: string; opponentPlayerId: string; chip: PairingChip }[],
): { points: number[][]; rated: number } {
  const byPair = new Map(ratings.map((r) => [`${r.playerId}|${r.opponentPlayerId}`, r.chip]));
  let rated = 0;
  const points = ourIds.map((o) =>
    theirIds.map((t) => {
      const chip = byPair.get(`${o}|${t}`);
      if (chip === undefined) return UNRATED_POINTS;
      rated += 1;
      return CHIP_POINTS[chip];
    }),
  );
  return { points, rated };
}
```

```ts
// packages/shared/src/pairing/matrix-game.ts
export interface GameSolution {
  /** The game's value for the row player. */
  value: number;
  /** Row player's optimal mixed strategy. */
  rows: number[];
  /** Column player's optimal mixed strategy. */
  cols: number[];
}

const EPS = 1e-12;

/**
 * Solves a zero-sum matrix game exactly; rows maximise. The classic reduction: shift every entry
 * positive, then the column player's LP max Σy s.t. B·y ≤ 1 by the simplex method; the row
 * player's strategy is the dual.
 */
export function solveMatrixGame(a: number[][]): GameSolution {
  const m = a.length;
  const n = a[0]?.length ?? 0;
  if (m === 0 || n === 0) throw new Error('A game needs at least one row and one column');
  const shift = 1 - Math.min(...a.flat());
  const width = n + m + 1;
  const t: number[][] = a.map((row, i) => {
    const r = new Array<number>(width).fill(0);
    row.forEach((v, j) => (r[j] = v + shift));
    r[n + i] = 1;
    r[width - 1] = 1;
    return r;
  });
  let obj = new Array<number>(width).fill(0);
  for (let j = 0; j < n; j += 1) obj[j] = -1;
  const basis = Array.from({ length: m }, (_, i) => n + i);
  for (;;) {
    let col = -1;
    let most = -EPS;
    for (let j = 0; j < n + m; j += 1) {
      const v = obj[j] ?? 0;
      if (v < most) {
        most = v;
        col = j;
      }
    }
    if (col < 0) break;
    let row = -1;
    let ratio = Infinity;
    for (let i = 0; i < m; i += 1) {
      const v = t[i]?.[col] ?? 0;
      if (v > EPS) {
        const r = (t[i]?.[width - 1] ?? 0) / v;
        if (r < ratio - EPS) {
          ratio = r;
          row = i;
        }
      }
    }
    if (row < 0) throw new Error('Unbounded game');
    const pivotRow = t[row] ?? [];
    const pivot = pivotRow[col] ?? 1;
    const scaled = pivotRow.map((v) => v / pivot);
    t[row] = scaled;
    for (let i = 0; i < m; i += 1) {
      if (i === row) continue;
      const r = t[i] ?? [];
      const f = r[col] ?? 0;
      if (Math.abs(f) > 1e-15) t[i] = r.map((v, k) => v - f * (scaled[k] ?? 0));
    }
    const f = obj[col] ?? 0;
    obj = obj.map((v, k) => v - f * (scaled[k] ?? 0));
    basis[row] = col;
  }
  const total = obj[width - 1] ?? 1;
  const cols = new Array<number>(n).fill(0);
  basis.forEach((b, i) => {
    if (b < n) cols[b] = (t[i]?.[width - 1] ?? 0) / total;
  });
  const rows = Array.from({ length: m }, (_, i) => (obj[n + i] ?? 0) / total);
  return { value: 1 / total - shift, rows, cols };
}
```

```ts
// packages/shared/src/pairing/index.ts
export * from './scale';
export * from './matrix-game';
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm vitest run --project shared packages/shared/src/pairing`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check > /tmp/check.log 2>&1; grep -c "×" /tmp/check.log   # expect 0
git add packages/shared/src/pairing packages/shared/src/index.ts
git commit -m "feat: pairing chip scale and an exact zero-sum game solver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The 5-player pairing procedure as a game

**Files:**

- Create: `packages/shared/src/pairing/pairing.ts`
- Modify: `packages/shared/src/pairing/index.ts` (add `export * from './pairing';`)
- Test: `packages/shared/src/pairing/pairing.test.ts`

**Interfaces:**

- Consumes: `solveMatrixGame` (Task 1).
- Produces:
  - `createPairingGame(points: number[][])` → `{ defenders(A, B), attackers(A, B, d, e), choices(A, B, d, e, p, q), value(A, B) }` with `A`, `B` as `number[]` (player indexes still to pair) and `p`, `q` as `[number, number]` (our and their attackers). `defenders` returns `GameSolution & { table: number[][] }` (rows our defender in `A` order, cols theirs in `B` order). `attackers` returns `GameSolution & { table: number[][]; ours: [number, number][]; theirs: [number, number][] }` (rows our pairs, cols theirs). `choices` returns `GameSolution & { table: number[][] }` with rows = which of `q` our defender takes, cols = which of `p` their defender takes.
  - `analysePairing(points: number[][]): PairingAnalysis` with
    `PairingAnalysis = { value: number; ourDefender: number[]; theirDefender: number[]; defenderGrid: number[][]; safeDefender: { index: number; worst: number }; attackerOptions(d: number, e: number): AttackerOption[]; game: ReturnType<typeof createPairingGame> }` and
    `AttackerOption = { pair: [number, number]; likely: number; worst: number; share: number }` (`likely` = against their likely send, `worst` = if they read our send, `share` = how often the best play sends this pair).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/pairing/pairing.test.ts
import { describe, expect, it } from 'vitest';
import { analysePairing } from './pairing';

/** R1 v Mighty Ducks Heresy. Ours: SM, EC, Daemons, WE, Sororitas; theirs: GK, DG, Orks, CSM, Custodes. */
const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];

describe('analysePairing', () => {
  it('reproduces the R1 analysis: 49.7 expected, World Eaters the safe defender at 49.1', () => {
    const a = analysePairing(R1);
    expect(a.value).toBeCloseTo(49.7, 1);
    expect(a.safeDefender.index).toBe(3);
    expect(a.safeDefender.worst).toBeCloseTo(49.1, 1);
    expect(a.ourDefender.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 9);
  });

  it('when they defend CSM and we defend Space Marines, EC + World Eaters is the best send', () => {
    const options = analysePairing(R1).attackerOptions(0, 3);
    const best = options.reduce((x, y) => (y.likely > x.likely ? y : x));
    expect(best.pair).toEqual([1, 3]);
    expect(best.likely).toBeCloseTo(51.8, 1);
    expect(options).toHaveLength(6);
  });

  it('every game even: 50 everywhere', () => {
    const even = Array.from({ length: 5 }, () => [10, 10, 10, 10, 10]);
    const a = analysePairing(even);
    expect(a.value).toBeCloseTo(50, 9);
    a.defenderGrid.flat().forEach((v) => expect(v).toBeCloseTo(50, 9));
  });

  it('a team better in every game scores above 50', () => {
    const better = Array.from({ length: 5 }, () => [13, 13, 17, 13, 13]);
    expect(analysePairing(better).value).toBeGreaterThan(50);
  });

  it('solves the whole tree in under 100 ms', () => {
    const start = performance.now();
    analysePairing(R1);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run --project shared packages/shared/src/pairing/pairing.test.ts`
Expected: FAIL, cannot resolve `./pairing`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/pairing/pairing.ts
import { solveMatrixGame, type GameSolution } from './matrix-game';

export type Pair = [number, number];

const pairsOf = (list: number[]): Pair[] => {
  const out: Pair[] = [];
  for (let i = 0; i < list.length; i += 1)
    for (let j = i + 1; j < list.length; j += 1) out.push([list[i] ?? 0, list[j] ?? 0]);
  return out;
};
const without = (list: number[], ...drop: number[]) => list.filter((x) => !drop.includes(x));

/**
 * The 5-player procedure as a game, solved backwards. Our rating of a game is `points[ours][theirs]`;
 * the opponents value it as 20 − that, so every choice is a zero-sum game for our total.
 */
export function createPairingGame(points: number[][]) {
  const pt = (a: number, b: number) => points[a]?.[b] ?? 10;
  const memo = new Map<string, unknown>();
  const cached = <T>(key: string, make: () => T): T => {
    if (!memo.has(key)) memo.set(key, make());
    return memo.get(key) as T;
  };

  function value(A: number[], B: number[]): number {
    if (A.length === 1) return pt(A[0] ?? 0, B[0] ?? 0);
    return defenders(A, B).value;
  }

  function defenders(A: number[], B: number[]): GameSolution & { table: number[][] } {
    return cached(`d|${A.join()}|${B.join()}`, () => {
      const table = A.map((d) => B.map((e) => attackers(A, B, d, e).value));
      return { ...solveMatrixGame(table), table };
    });
  }

  function attackers(A: number[], B: number[], d: number, e: number) {
    return cached(`a|${A.join()}|${B.join()}|${d}|${e}`, () => {
      const ours = pairsOf(without(A, d));
      const theirs = pairsOf(without(B, e));
      const table = ours.map((p) => theirs.map((q) => choices(A, B, d, e, p, q).value));
      return { ...solveMatrixGame(table), table, ours, theirs };
    });
  }

  /** Rows: which of their pair `q` our defender takes; cols: which of our pair `p` theirs takes. */
  function choices(A: number[], B: number[], d: number, e: number, p: Pair, q: Pair) {
    return cached(`c|${A.join()}|${B.join()}|${d}|${e}|${p.join()}|${q.join()}`, () => {
      const table = q.map((b) =>
        p.map((a) => {
          const restA = without(A, d, a);
          const restB = without(B, e, b);
          return pt(d, b) + pt(a, e) + value(restA, restB);
        }),
      );
      return { ...solveMatrixGame(table), table };
    });
  }

  return { value, defenders, attackers, choices, pt };
}

export interface AttackerOption {
  pair: Pair;
  /** Expected team score if they send their likely pair. */
  likely: number;
  /** If they read our send perfectly. */
  worst: number;
  /** How often best play sends this pair. */
  share: number;
}

export interface PairingAnalysis {
  value: number;
  ourDefender: number[];
  theirDefender: number[];
  /** Expected team score for each round-1 defender pair: [ours][theirs]. */
  defenderGrid: number[][];
  safeDefender: { index: number; worst: number };
  attackerOptions(d: number, e: number): AttackerOption[];
  game: ReturnType<typeof createPairingGame>;
}

const ALL = [0, 1, 2, 3, 4];

/** Everything the page shows for a 5 v 5 rating matrix. */
export function analysePairing(points: number[][]): PairingAnalysis {
  const game = createPairingGame(points);
  const top = game.defenders(ALL, ALL);
  const worst = top.table.map((row) => Math.min(...row));
  const index = worst.indexOf(Math.max(...worst));
  return {
    value: top.value,
    ourDefender: top.rows,
    theirDefender: top.cols,
    defenderGrid: top.table,
    safeDefender: { index, worst: worst[index] ?? 0 },
    attackerOptions(d, e) {
      const s = game.attackers(ALL, ALL, d, e);
      return s.ours.map((pair, i) => {
        const row = s.table[i] ?? [];
        return {
          pair,
          likely: row.reduce((sum, v, j) => sum + v * (s.cols[j] ?? 0), 0),
          worst: Math.min(...row),
          share: s.rows[i] ?? 0,
        };
      });
    },
    game,
  };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm vitest run --project shared packages/shared/src/pairing`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check > /tmp/check.log 2>&1; grep -c "×" /tmp/check.log   # expect 0
git add packages/shared/src/pairing
git commit -m "feat: the 5-player pairing procedure solved as a game

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The chain of decisions

**Files:**

- Create: `packages/shared/src/pairing/chain.ts`
- Modify: `packages/shared/src/pairing/index.ts` (add `export * from './chain';`)
- Test: `packages/shared/src/pairing/chain.test.ts`

**Interfaces:**

- Consumes: `analysePairing`, `createPairingGame`, `Pair` (Task 2).
- Produces: `pairingChain(analysis: PairingAnalysis, d: number, e: number, ours: Pair): PairingChain`, `CHAIN_MIN_SHARE = 0.02`, and the types:

```ts
export interface ChainLeaf {
  p: number;
  weTake: number;
  theyTake: number;
  last: Pair;
  games: Pair[];
  total: number;
}
export interface ChainRound2 {
  p: number;
  d: number;
  e: number;
  ours: Pair;
  theirs: Pair;
  value: number;
  leaves: ChainLeaf[];
  other: number;
}
export interface ChainPick {
  p: number;
  weTake: number;
  theyTake: number;
  value: number;
  round2: ChainRound2[];
  other: number;
}
export interface ChainSend {
  p: number;
  theirs: Pair;
  value: number;
  picks: ChainPick[];
  other: number;
}
export interface PairingChain {
  d: number;
  e: number;
  ours: Pair;
  value: number;
  sends: ChainSend[];
  other: number;
}
```

`p` is always the share of the parent step. `games` lists the five games of a leaf as `[ours, theirs]`, in order: round 1 our defender, round 1 their defender, round 2 our defender, round 2 their defender, last game.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/pairing/chain.test.ts
import { describe, expect, it } from 'vitest';
import { pairingChain } from './chain';
import { analysePairing } from './pairing';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];

describe('pairingChain', () => {
  const chain = pairingChain(analysePairing(R1), 3, 4, [1, 4]); // WE v Custodes, send EC + Sororitas

  it('each level shares add up to 1 with what was folded away', () => {
    const sum = chain.sends.reduce((s, b) => s + b.p, 0) + chain.other;
    expect(sum).toBeCloseTo(1, 6);
    for (const send of chain.sends) {
      expect(send.picks.reduce((s, x) => s + x.p, 0) + send.other).toBeCloseTo(1, 6);
      for (const pick of send.picks)
        expect(pick.round2.reduce((s, n) => s + n.p, 0) + pick.other).toBeCloseTo(1, 6);
    }
  });

  it('every line-up has five games, each player once on each side', () => {
    for (const send of chain.sends)
      for (const pick of send.picks)
        for (const node of pick.round2)
          for (const leaf of node.leaves) {
            expect(new Set(leaf.games.map((g) => g[0])).size).toBe(5);
            expect(new Set(leaf.games.map((g) => g[1])).size).toBe(5);
            expect(leaf.total).toBeCloseTo(
              leaf.games.reduce((s, [a, b]) => s + (R1[a]?.[b] ?? 0), 0),
              9,
            );
          }
  });

  it('matches the spreadsheet analysis: DG + Orks 66%, then EC defends v CSM and the line-up totals 50', () => {
    const dgOrks = chain.sends.find((s) => s.theirs.join() === '1,2');
    expect(dgOrks?.p).toBeCloseTo(0.657, 2);
    const leaf = dgOrks?.picks[0]?.round2[0]?.leaves[0];
    expect(dgOrks?.picks[0]?.round2[0]?.d).toBe(1);
    expect(dgOrks?.picks[0]?.round2[0]?.e).toBe(3);
    expect(leaf?.total).toBeCloseTo(50, 9);
    expect(chain.value).toBeCloseTo(49.8, 1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run --project shared packages/shared/src/pairing/chain.test.ts`
Expected: FAIL, cannot resolve `./chain`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/pairing/chain.ts
import type { Pair, PairingAnalysis } from './pairing';

export interface ChainLeaf {
  p: number;
  weTake: number;
  theyTake: number;
  last: Pair;
  games: Pair[];
  total: number;
}
export interface ChainRound2 {
  p: number;
  d: number;
  e: number;
  ours: Pair;
  theirs: Pair;
  value: number;
  leaves: ChainLeaf[];
  other: number;
}
export interface ChainPick {
  p: number;
  weTake: number;
  theyTake: number;
  value: number;
  round2: ChainRound2[];
  other: number;
}
export interface ChainSend {
  p: number;
  theirs: Pair;
  value: number;
  picks: ChainPick[];
  other: number;
}
export interface PairingChain {
  d: number;
  e: number;
  ours: Pair;
  value: number;
  sends: ChainSend[];
  other: number;
}

/** Branches below this share of their parent are folded into "other". */
export const CHAIN_MIN_SHARE = 0.02;
const EPS = 1e-9;
const ALL = [0, 1, 2, 3, 4];
const without = (list: number[], ...drop: number[]) => list.filter((x) => !drop.includes(x));
const weighted = <T extends { p: number }>(items: T[], v: (x: T) => number) =>
  items.reduce((s, x) => s + x.p * v(x), 0) / (items.reduce((s, x) => s + x.p, 0) || 1);
function fold<T extends { p: number }>(items: T[]): { kept: T[]; other: number } {
  return {
    kept: items.filter((x) => x.p >= CHAIN_MIN_SHARE),
    other: items.filter((x) => x.p < CHAIN_MIN_SHARE).reduce((s, x) => s + x.p, 0),
  };
}

/** Every way the pairing goes once both defenders and our two attackers are chosen. */
export function pairingChain(
  analysis: PairingAnalysis,
  d: number,
  e: number,
  ours: Pair,
): PairingChain {
  const { game } = analysis;
  const pt = game.pt;

  /** The simultaneous picks: our defender takes `b` from `q`, theirs takes `a` from `p`. */
  const picks = (A: number[], B: number[], dd: number, ee: number, p: Pair, q: Pair) => {
    const c = game.choices(A, B, dd, ee, p, q);
    const out: { p: number; b: number; a: number }[] = [];
    q.forEach((b, bi) =>
      p.forEach((a, ai) => {
        const w = (c.rows[bi] ?? 0) * (c.cols[ai] ?? 0);
        if (w > EPS) out.push({ p: w, b, a });
      }),
    );
    return out;
  };

  const round2 = (A: number[], B: number[], locked: Pair[]): ChainRound2[] => {
    const t = game.defenders(A, B);
    const nodes: ChainRound2[] = [];
    A.forEach((d2, di) =>
      B.forEach((e2, ei) => {
        const pde = (t.rows[di] ?? 0) * (t.cols[ei] ?? 0);
        if (pde <= EPS) return;
        const ourPair = without(A, d2) as Pair;
        const theirPair = without(B, e2) as Pair;
        const leaves = picks(A, B, d2, e2, ourPair, theirPair).map(({ p, b, a }): ChainLeaf => {
          const last: Pair = [without(ourPair, a)[0] ?? 0, without(theirPair, b)[0] ?? 0];
          const games: Pair[] = [...locked, [d2, b], [a, e2], last];
          return {
            p,
            weTake: b,
            theyTake: a,
            last,
            games,
            total: games.reduce((s, [x, y]) => s + pt(x, y), 0),
          };
        });
        const { kept, other } = fold(leaves);
        nodes.push({
          p: pde,
          d: d2,
          e: e2,
          ours: ourPair,
          theirs: theirPair,
          value: weighted(leaves, (l) => l.total),
          leaves: kept,
          other,
        });
      }),
    );
    return nodes;
  };

  const s = game.attackers(ALL, ALL, d, e);
  const sends: ChainSend[] = [];
  s.theirs.forEach((q, j) => {
    const pq = s.cols[j] ?? 0;
    if (pq <= EPS) return;
    const pickNodes = picks(ALL, ALL, d, e, ours, q).map(({ p, b, a }): ChainPick => {
      const nodes = round2(without(ALL, d, a), without(ALL, e, b), [
        [d, b],
        [a, e],
      ]);
      const { kept, other } = fold(nodes);
      return {
        p,
        weTake: b,
        theyTake: a,
        value: weighted(nodes, (n) => n.value),
        round2: kept,
        other,
      };
    });
    const { kept, other } = fold(pickNodes);
    sends.push({
      p: pq,
      theirs: q,
      value: weighted(pickNodes, (x) => x.value),
      picks: kept,
      other,
    });
  });
  const { kept, other } = fold(sends);
  return { d, e, ours, value: weighted(sends, (x) => x.value), sends: kept, other };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm vitest run --project shared packages/shared/src/pairing`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check > /tmp/check.log 2>&1; grep -c "×" /tmp/check.log   # expect 0
git add packages/shared/src/pairing
git commit -m "feat: the chain of pairing decisions down to every final line-up

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API contract (shared schemas)

**Files:**

- Create: `packages/shared/src/pairing/api.ts`
- Modify: `packages/shared/src/pairing/index.ts` (add `export * from './api';`)
- Test: `packages/shared/src/pairing/api.test.ts`

**Interfaces:**

- Consumes: `PAIRING_CHIPS` (Task 1).
- Produces: `PairingChipSchema`, `PairingTeamsResponseSchema` (`{ team: {id, name}; opponents: {id, name}[] }`), `PairingRosterPlayerSchema` (`{ id; name; faction: string | null; detachments: string[]; list: string | null }`), `PairingRatingSchema` (`{ playerId; opponentPlayerId; chip }`), `PairingResponseSchema` (`{ team; opponent; ours; theirs; ratings; problem: string | null }`), `SaveRatingRequestSchema` (`{ chip: PairingChip | null }`), `SaveRatingResponseSchema` (`{ rating: { playerId; opponentPlayerId; chip: PairingChip | null } }`), and the inferred types `PairingTeamsResponse`, `PairingResponse`, `PairingRosterPlayer`, `PairingRating`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/pairing/api.test.ts
import { describe, expect, it } from 'vitest';
import { PairingResponseSchema, SaveRatingRequestSchema } from './api';

describe('pairing API schemas', () => {
  it('accept a full response and refuse an unknown chip', () => {
    const team = { id: 'T1', name: 'Dice Bunker' };
    const player = {
      id: 'P1',
      name: 'Kubi',
      faction: 'Space Marines',
      detachments: [],
      list: null,
    };
    expect(
      PairingResponseSchema.parse({
        team,
        opponent: { id: 'T2', name: 'Mighty Ducks' },
        ours: [player],
        theirs: [],
        ratings: [{ playerId: 'P1', opponentPlayerId: 'Q1', chip: 'GG' }],
        problem: null,
      }).ratings[0]?.chip,
    ).toBe('GG');
    expect(SaveRatingRequestSchema.safeParse({ chip: 'XX' }).success).toBe(false);
    expect(SaveRatingRequestSchema.parse({ chip: null }).chip).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project shared packages/shared/src/pairing/api.test.ts`
Expected: FAIL, cannot resolve `./api`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/pairing/api.ts
import { z } from 'zod';
import { PAIRING_CHIPS } from './scale';

export const PairingChipSchema = z.enum(PAIRING_CHIPS);
const TeamRefSchema = z.object({ id: z.string(), name: z.string() });

/** GET /api/events/:id/teams/:teamId/pairings: the team and the teams it can prepare against. */
export const PairingTeamsResponseSchema = z.object({
  team: TeamRefSchema,
  opponents: z.array(TeamRefSchema),
});
export type PairingTeamsResponse = z.infer<typeof PairingTeamsResponseSchema>;

export const PairingRosterPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  faction: z.string().nullable(),
  detachments: z.array(z.string()),
  /** The list text, when fetched. */
  list: z.string().nullable(),
});
export type PairingRosterPlayer = z.infer<typeof PairingRosterPlayerSchema>;

export const PairingRatingSchema = z.object({
  playerId: z.string(),
  opponentPlayerId: z.string(),
  chip: PairingChipSchema,
});
export type PairingRating = z.infer<typeof PairingRatingSchema>;

/** GET /api/events/:id/teams/:teamId/pairings/:opponentTeamId */
export const PairingResponseSchema = z.object({
  team: TeamRefSchema,
  opponent: TeamRefSchema,
  ours: z.array(PairingRosterPlayerSchema),
  theirs: z.array(PairingRosterPlayerSchema),
  ratings: z.array(PairingRatingSchema),
  /** Why there's no analysis (e.g. a team without exactly 5 players); null when there is. */
  problem: z.string().nullable(),
});
export type PairingResponse = z.infer<typeof PairingResponseSchema>;

/** PUT …/pairings/:opponentTeamId/:playerId/:opponentPlayerId; null clears the rating. */
export const SaveRatingRequestSchema = z.object({ chip: PairingChipSchema.nullable() });
export const SaveRatingResponseSchema = z.object({
  rating: PairingRatingSchema.extend({ chip: PairingChipSchema.nullable() }),
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run --project shared packages/shared/src/pairing`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check > /tmp/check.log 2>&1; grep -c "×" /tmp/check.log   # expect 0
git add packages/shared/src/pairing
git commit -m "feat: pairing API schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Storing ratings and serving rosters (API)

**Files:**

- Modify: `apps/api/src/db/schema.ts` (add `pairingChip` enum and `pairingRatings` table at the end)
- Create: `apps/api/drizzle/0016_pairing-ratings.sql` (generated) and its `meta` snapshot
- Modify: `apps/api/src/db/test-db.ts` (add `pairing_ratings` to the truncate list)
- Create: `apps/api/src/repo/pairings.ts`
- Create: `apps/api/src/routes/pairings.ts`
- Modify: `apps/api/src/app.ts` (register `pairingRoutes`)
- Test: `apps/api/src/routes/pairings.test.ts`

**Interfaces:**

- Consumes: the schemas from Task 4; `armyRules(db)` from `apps/api/src/repo/detachment-links.ts` (returns `{ army(faction, parsedArmy, detachments) => { faction, factionGuessed }, detachments(faction, detachments) => string[] }`); `storedCurrentList` from `apps/api/src/repo/lists.ts`; `requireEvent` from `apps/api/src/routes/require-event.ts`; `NotFoundError`, `ValidationError` from `apps/api/src/errors.ts`; `parseInput` from `apps/api/src/validation.ts`; `requireJson` from `apps/api/src/routes/require-json.ts`.
- Produces: `GET /api/events/:id/teams/:teamId/pairings`, `GET /api/events/:id/teams/:teamId/pairings/:opponentTeamId`, `PUT /api/events/:id/teams/:teamId/pairings/:opponentTeamId/:playerId/:opponentPlayerId`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/routes/pairings.test.ts
import type { PairingResponse, PairingTeamsResponse } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { events, players, teams } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

const EVENT = 'EVT-PAIR';
let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApp>;

async function seed(ourCount = 5, extra: Partial<typeof players.$inferInsert>[] = []) {
  await db.insert(events).values({
    id: EVENT,
    name: 'Balkan Team Championship',
    startDate: new Date('2026-10-10'),
    playerCount: 10,
    isTeamEvent: true,
    isOnline: false,
    roundCount: 5,
    ended: false,
    hideLists: false,
  });
  await db.insert(teams).values([
    { id: 'T-US', eventId: EVENT, name: 'Dice Bunker', roundPoints: [], raw: {} },
    { id: 'T-THEM', eventId: EVENT, name: 'Mighty Ducks', roundPoints: [], raw: {} },
  ]);
  const player = (id: string, teamId: string, faction: string) => ({
    id,
    eventId: EVENT,
    teamId,
    name: id,
    faction,
    wins: 0,
    losses: 0,
    draws: 0,
    dropped: false,
    raw: {},
  });
  await db
    .insert(players)
    .values([
      ...Array.from({ length: ourCount }, (_, i) => player(`US${i}`, 'T-US', 'Space Marines')),
      ...Array.from({ length: 5 }, (_, i) => player(`TH${i}`, 'T-THEM', 'Orks')),
      ...extra.map((x, i) => ({ ...player(`X${i}`, 'T-US', 'Necrons'), ...x })),
    ]);
}

const get = async <T>(path: string) => {
  const r = await app.request(path);
  return { status: r.status, body: (await r.json()) as T };
};
const put = (path: string, body: unknown) =>
  app.request(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const BASE = `/api/events/${EVENT}/teams/T-US/pairings`;

beforeAll(async () => ({ db, close } = await createTestDb()));
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const source = sampleSource();
  app = createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
    fetchQueue: testFetchQueue(db, source),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures',
        state: 'fixtures',
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
    eventRule: ALL_EVENTS,
  });
});

describe('pairing routes', () => {
  it('lists the teams to prepare against', async () => {
    await seed();
    const { body } = await get<PairingTeamsResponse>(BASE);
    expect(body).toEqual({
      team: { id: 'T-US', name: 'Dice Bunker' },
      opponents: [{ id: 'T-THEM', name: 'Mighty Ducks' }],
    });
  });

  it('serves both rosters, saves, reads and clears a rating', async () => {
    await seed();
    expect((await put(`${BASE}/T-THEM/US0/TH3`, { chip: 'RR' })).status).toBe(200);
    let { body } = await get<PairingResponse>(`${BASE}/T-THEM`);
    expect(body.ours).toHaveLength(5);
    expect(body.theirs[0]).toMatchObject({
      name: 'TH0',
      faction: 'Orks',
      detachments: [],
      list: null,
    });
    expect(body.ratings).toEqual([{ playerId: 'US0', opponentPlayerId: 'TH3', chip: 'RR' }]);
    expect(body.problem).toBeNull();
    await put(`${BASE}/T-THEM/US0/TH3`, { chip: 'G' });
    ({ body } = await get<PairingResponse>(`${BASE}/T-THEM`));
    expect(body.ratings[0]?.chip).toBe('G');
    await put(`${BASE}/T-THEM/US0/TH3`, { chip: null });
    ({ body } = await get<PairingResponse>(`${BASE}/T-THEM`));
    expect(body.ratings).toEqual([]);
  });

  it('says why when a team does not have 5 players', async () => {
    await seed(4);
    const { body } = await get<PairingResponse>(`${BASE}/T-THEM`);
    expect(body.problem).toBe('Dice Bunker has 4 players; pairings need 5 on each team.');
  });

  it('leaves out dropped players', async () => {
    await seed(5, [{ dropped: true }]);
    const { body } = await get<PairingResponse>(`${BASE}/T-THEM`);
    expect(body.ours.map((p) => p.id)).not.toContain('X0');
    expect(body.problem).toBeNull();
  });

  it('refuses a team against itself, a player from the wrong team, an unknown team and a bad chip', async () => {
    await seed();
    expect((await get(`${BASE}/T-US`)).status).toBe(400);
    expect((await put(`${BASE}/T-THEM/TH0/US0`, { chip: 'G' })).status).toBe(400);
    expect((await get(`${BASE}/T-NOPE`)).status).toBe(404);
    expect((await put(`${BASE}/T-THEM/US0/TH0`, { chip: 'XX' })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run --project api apps/api/src/routes/pairings.test.ts`
Expected: FAIL with 404 responses (routes not registered).

- [ ] **Step 3: Add the table and migration**

Append to `apps/api/src/db/schema.ts`:

```ts
export const pairingChip = pgEnum('pairing_chip', ['BOUYA', 'GG', 'G', 'Y', 'R', 'RR', 'F']);

/** A team's rating of one of its players against one of the opposing team's players, for pairings. */
export const pairingRatings = pgTable(
  'pairing_ratings',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    teamId: text('team_id').notNull(),
    opponentTeamId: text('opponent_team_id').notNull(),
    playerId: text('player_id').notNull(),
    opponentPlayerId: text('opponent_player_id').notNull(),
    chip: pairingChip('chip').notNull(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.eventId, t.teamId, t.opponentTeamId, t.playerId, t.opponentPlayerId],
    }),
  ],
);
```

Run: `pnpm --filter ./apps/api db:generate --name pairing-ratings`
Expected: creates `apps/api/drizzle/0016_pairing-ratings.sql` with `CREATE TYPE "public"."pairing_chip"` and `CREATE TABLE "pairing_ratings"`.

In `apps/api/src/db/test-db.ts`, add `pairing_ratings` to the `truncate` list (before `restart identity cascade`).

- [ ] **Step 4: Implement the repo**

```ts
// apps/api/src/repo/pairings.ts
import type { PairingChip, PairingRating, PairingRosterPlayer } from '@bcp/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, pairingRatings, players, teams } from '../db/schema';
import { armyRules } from './detachment-links';
import { storedCurrentList } from './lists';

export async function eventTeams(db: Db, eventId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.eventId, eventId))
    .orderBy(asc(teams.name));
}

/** The team's players who haven't dropped, with their army, detachments and list. */
export async function roster(
  db: Db,
  eventId: string,
  teamId: string,
): Promise<PairingRosterPlayer[]> {
  const rules = await armyRules(db);
  const rows = await db
    .select({
      id: players.id,
      name: players.name,
      faction: players.faction,
      parsedArmy: armyLists.parsedArmy,
      detachments: armyLists.detachments,
      list: armyLists.text,
    })
    .from(players)
    .leftJoin(armyLists, storedCurrentList)
    .where(
      and(eq(players.eventId, eventId), eq(players.teamId, teamId), eq(players.dropped, false)),
    )
    .orderBy(asc(players.name));
  return rows.map((row) => {
    const army = rules.army(row.faction, row.parsedArmy, row.detachments ?? []);
    return {
      id: row.id,
      name: row.name,
      faction: army.faction,
      detachments: rules.detachments(army.faction, row.detachments ?? []),
      list: row.list ?? null,
    };
  });
}

export async function ratings(
  db: Db,
  eventId: string,
  teamId: string,
  opponentTeamId: string,
): Promise<PairingRating[]> {
  return db
    .select({
      playerId: pairingRatings.playerId,
      opponentPlayerId: pairingRatings.opponentPlayerId,
      chip: pairingRatings.chip,
    })
    .from(pairingRatings)
    .where(
      and(
        eq(pairingRatings.eventId, eventId),
        eq(pairingRatings.teamId, teamId),
        eq(pairingRatings.opponentTeamId, opponentTeamId),
      ),
    );
}

export async function saveRating(
  db: Db,
  key: {
    eventId: string;
    teamId: string;
    opponentTeamId: string;
    playerId: string;
    opponentPlayerId: string;
  },
  chip: PairingChip | null,
): Promise<void> {
  if (chip === null) {
    await db
      .delete(pairingRatings)
      .where(
        and(
          eq(pairingRatings.eventId, key.eventId),
          eq(pairingRatings.teamId, key.teamId),
          eq(pairingRatings.opponentTeamId, key.opponentTeamId),
          eq(pairingRatings.playerId, key.playerId),
          eq(pairingRatings.opponentPlayerId, key.opponentPlayerId),
        ),
      );
    return;
  }
  await db
    .insert(pairingRatings)
    .values({ ...key, chip })
    .onConflictDoUpdate({
      target: [
        pairingRatings.eventId,
        pairingRatings.teamId,
        pairingRatings.opponentTeamId,
        pairingRatings.playerId,
        pairingRatings.opponentPlayerId,
      ],
      set: { chip, updatedAt: new Date() },
    });
}
```

- [ ] **Step 5: Implement the routes**

```ts
// apps/api/src/routes/pairings.ts
import {
  SaveRatingRequestSchema,
  type PairingResponse,
  type PairingTeamsResponse,
} from '@bcp/shared';
import { Hono } from 'hono';
import type { Db } from '../db/client';
import { NotFoundError, ValidationError } from '../errors';
import { eventTeams, ratings, roster, saveRating } from '../repo/pairings';
import { parseInput } from '../validation';
import { requireEvent } from './require-event';
import { requireJson } from './require-json';

const PLAYERS = 5;

/** A team's pairing ratings against an opposing team in the same event; the analysis runs in the browser. */
export function pairingRoutes(deps: { db: Db }) {
  const { db } = deps;
  const teamsOf = async (eventId: string, teamId: string, opponentTeamId?: string) => {
    await requireEvent(db, eventId);
    const all = await eventTeams(db, eventId);
    const team = all.find((t) => t.id === teamId);
    if (!team) throw new NotFoundError(`Team ${teamId} is not part of event ${eventId}`);
    if (opponentTeamId === undefined) return { team, opponent: null, all };
    const opponent = all.find((t) => t.id === opponentTeamId);
    if (!opponent)
      throw new NotFoundError(`Team ${opponentTeamId} is not part of event ${eventId}`);
    if (opponent.id === team.id) {
      throw new ValidationError(
        [{ path: 'opponentTeamId', message: 'Pick another team' }],
        'A team cannot pair against itself',
      );
    }
    return { team, opponent, all };
  };

  return new Hono()
    .get('/events/:id/teams/:teamId/pairings', async (c) => {
      const { id, teamId } = c.req.param();
      const { team, all } = await teamsOf(id, teamId);
      const body: PairingTeamsResponse = { team, opponents: all.filter((t) => t.id !== team.id) };
      return c.json(body);
    })
    .get('/events/:id/teams/:teamId/pairings/:opponentTeamId', async (c) => {
      const { id, teamId, opponentTeamId } = c.req.param();
      const { team, opponent } = await teamsOf(id, teamId, opponentTeamId);
      if (!opponent) throw new NotFoundError('Opponent missing');
      const [ours, theirs, stored] = await Promise.all([
        roster(db, id, team.id),
        roster(db, id, opponent.id),
        ratings(db, id, team.id, opponent.id),
      ]);
      const short = [
        [team, ours],
        [opponent, theirs],
      ] as const;
      const bad = short.find(([, list]) => list.length !== PLAYERS);
      const problem = bad
        ? `${bad[0].name} has ${bad[1].length} players; pairings need ${PLAYERS} on each team.`
        : null;
      const body: PairingResponse = { team, opponent, ours, theirs, ratings: stored, problem };
      return c.json(body);
    })
    .put(
      '/events/:id/teams/:teamId/pairings/:opponentTeamId/:playerId/:opponentPlayerId',
      requireJson,
      async (c) => {
        const { id, teamId, opponentTeamId, playerId, opponentPlayerId } = c.req.param();
        const { chip } = parseInput(
          SaveRatingRequestSchema,
          await c.req.json<unknown>().catch(() => null),
        );
        const { team, opponent } = await teamsOf(id, teamId, opponentTeamId);
        if (!opponent) throw new NotFoundError('Opponent missing');
        const [ours, theirs] = await Promise.all([
          roster(db, id, team.id),
          roster(db, id, opponent.id),
        ]);
        if (
          !ours.some((p) => p.id === playerId) ||
          !theirs.some((p) => p.id === opponentPlayerId)
        ) {
          throw new ValidationError(
            [{ path: 'playerId', message: 'Not a player of these teams' }],
            'Those players are not on these teams',
          );
        }
        await saveRating(
          db,
          { eventId: id, teamId: team.id, opponentTeamId: opponent.id, playerId, opponentPlayerId },
          chip,
        );
        return c.json({ rating: { playerId, opponentPlayerId, chip } });
      },
    );
}
```

Register in `apps/api/src/app.ts` next to the other analysis routes: `app.route('/api', pairingRoutes({ db: deps.db }));` (import it from `./routes/pairings`).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run --project api apps/api/src/routes/pairings.test.ts apps/api/src/db`
Expected: PASS (pairing tests and the migration tests).

- [ ] **Step 7: Commit**

```bash
pnpm check > /tmp/check.log 2>&1; grep -c "×" /tmp/check.log   # expect 0
git add apps/api packages/shared
git commit -m "feat: store a team's pairing ratings and serve both rosters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pairings page with the ratings table

**Files:**

- Modify: `apps/web/src/api/client.ts` (add `apiPut`, same shape as `apiPatch` with `method: 'PUT'`)
- Create: `apps/web/src/features/pairings/pairing-queries.ts`
- Create: `apps/web/src/features/pairings/RatingsTable.tsx`, `RatingsTable.module.css`
- Create: `apps/web/src/features/pairings/PairingsPage.tsx`
- Create: `apps/web/src/routes/events.$eventId_.teams.$teamId_.pairings.tsx`
- Modify: `apps/web/src/features/analysis/TeamPage.tsx` (a "Pairings" link under the team name)
- Test: `apps/web/src/features/pairings/RatingsTable.test.tsx`, `apps/web/src/features/pairings/PairingsPage.test.tsx`

**Interfaces:**

- Consumes: Task 4 schemas, `pointsMatrix` (Task 1).
- Produces: `pairingTeamsQuery(eventId, teamId)`, `pairingQuery(eventId, teamId, opponentId)` (with `refetchInterval: 10_000`, `refetchOnWindowFocus: true`), `useSaveRating(eventId, teamId, opponentId)` (optimistic), `<RatingsTable ours theirs ratings onRate(playerId, opponentPlayerId, chip | null) />`, `<PairingsPage eventId teamId opponentId onOpponentChange />`. The analysis sections slot in after the table in Tasks 7–8.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/src/features/pairings/RatingsTable.test.tsx
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { RatingsTable } from './RatingsTable';

const p = (id: string, faction: string) => ({ id, name: id, faction, detachments: [], list: null });
const ours = ['A', 'B'].map((id) => p(id, 'Space Marines'));
const theirs = ['X', 'Y'].map((id) => p(id, 'Orks'));

describe('RatingsTable', () => {
  it('shows each rating, marks unrated games, and saves a picked chip', () => {
    const onRate = vi.fn();
    renderWithProviders(
      <RatingsTable
        ours={ours}
        theirs={theirs}
        ratings={[{ playerId: 'A', opponentPlayerId: 'Y', chip: 'RR' }]}
        onRate={onRate}
      />,
    );
    expect(screen.getByRole('button', { name: 'A v Y: RR' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A v X: unrated' }));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'GG' }));
    expect(onRate).toHaveBeenCalledWith('A', 'X', 'GG');
  });

  it('clears a rating', () => {
    const onRate = vi.fn();
    renderWithProviders(
      <RatingsTable
        ours={ours}
        theirs={theirs}
        ratings={[{ playerId: 'A', opponentPlayerId: 'Y', chip: 'RR' }]}
        onRate={onRate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A v Y: RR' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(onRate).toHaveBeenCalledWith('A', 'Y', null);
  });
});
```

```tsx
// apps/web/src/features/pairings/PairingsPage.test.tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { PairingsPage } from './PairingsPage';
import { pairingQuery } from './pairing-queries';

const team = { id: 'T1', name: 'Dice Bunker' };
const opponent = { id: 'T2', name: 'Mighty Ducks' };
const roster = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    name: `${prefix}${i}`,
    faction: 'Orks',
    detachments: [],
    list: null,
  }));

describe('PairingsPage', () => {
  it('shows how many games are rated', async () => {
    stubFetchRoutes({
      'GET /api/events/E1/teams/T1/pairings': { team, opponents: [opponent] },
      'GET /api/events/E1/teams/T1/pairings/T2': {
        team,
        opponent,
        ours: roster('U', 5),
        theirs: roster('H', 5),
        problem: null,
        ratings: [{ playerId: 'U0', opponentPlayerId: 'H0', chip: 'G' }],
      },
    });
    renderWithProviders(
      <PairingsPage eventId="E1" teamId="T1" opponentId="T2" onOpponentChange={() => {}} />,
    );
    expect(await screen.findByText(/^1 of 25 rated/)).toBeInTheDocument();
  });

  it('shows the problem instead of analysing', async () => {
    stubFetchRoutes({
      'GET /api/events/E1/teams/T1/pairings': { team, opponents: [opponent] },
      'GET /api/events/E1/teams/T1/pairings/T2': {
        team,
        opponent,
        ours: roster('U', 4),
        theirs: roster('H', 5),
        ratings: [],
        problem: 'Dice Bunker has 4 players; pairings need 5 on each team.',
      },
    });
    renderWithProviders(
      <PairingsPage eventId="E1" teamId="T1" opponentId="T2" onOpponentChange={() => {}} />,
    );
    expect(
      await screen.findByText('Dice Bunker has 4 players; pairings need 5 on each team.'),
    ).toBeInTheDocument();
  });

  it('asks for an opponent first', async () => {
    stubFetchRoutes({ 'GET /api/events/E1/teams/T1/pairings': { team, opponents: [opponent] } });
    renderWithProviders(
      <PairingsPage eventId="E1" teamId="T1" opponentId={null} onOpponentChange={() => {}} />,
    );
    expect(await screen.findByText('Pick the team you play this round.')).toBeInTheDocument();
  });

  it('refetches every 10 seconds so teammates’ edits appear', () => {
    expect(pairingQuery('E1', 'T1', 'T2').refetchInterval).toBe(10_000);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run --project web apps/web/src/features/pairings`
Expected: FAIL, cannot resolve `./RatingsTable` and `./PairingsPage`.

- [ ] **Step 3: Implement queries, client helper and table**

```ts
// apps/web/src/api/client.ts — add after apiPatch
/** PUTs a JSON body. */
export function apiPut<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
): Promise<z.output<S>> {
  return request(
    path,
    {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    schema,
  );
}
```

```ts
// apps/web/src/features/pairings/pairing-queries.ts
import {
  PairingResponseSchema,
  PairingTeamsResponseSchema,
  SaveRatingResponseSchema,
  type PairingChip,
  type PairingResponse,
} from '@bcp/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '../../api/client';

const base = (eventId: string, teamId: string) =>
  `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(teamId)}/pairings`;

export const pairingTeamsQuery = (eventId: string, teamId: string) =>
  queryOptions({
    queryKey: ['pairings', eventId, teamId],
    queryFn: () => apiGet(base(eventId, teamId), PairingTeamsResponseSchema),
  });

/** Polls so teammates' ratings appear without a reload. */
export const pairingQuery = (eventId: string, teamId: string, opponentId: string) =>
  queryOptions({
    queryKey: ['pairings', eventId, teamId, opponentId],
    queryFn: () =>
      apiGet(`${base(eventId, teamId)}/${encodeURIComponent(opponentId)}`, PairingResponseSchema),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

/** Saves one cell at once; the page shows the new chip before the server answers. */
export function useSaveRating(eventId: string, teamId: string, opponentId: string) {
  const client = useQueryClient();
  const key = pairingQuery(eventId, teamId, opponentId).queryKey;
  return useMutation({
    mutationFn: ({
      playerId,
      opponentPlayerId,
      chip,
    }: {
      playerId: string;
      opponentPlayerId: string;
      chip: PairingChip | null;
    }) =>
      apiPut(
        `${base(eventId, teamId)}/${encodeURIComponent(opponentId)}/${encodeURIComponent(playerId)}/${encodeURIComponent(opponentPlayerId)}`,
        { chip },
        SaveRatingResponseSchema,
      ),
    onMutate: async ({ playerId, opponentPlayerId, chip }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<PairingResponse>(key);
      client.setQueryData<PairingResponse>(key, (data) => {
        if (!data) return data;
        const rest = data.ratings.filter(
          (r) => !(r.playerId === playerId && r.opponentPlayerId === opponentPlayerId),
        );
        return {
          ...data,
          ratings: chip === null ? rest : [...rest, { playerId, opponentPlayerId, chip }],
        };
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}
```

```css
/* apps/web/src/features/pairings/RatingsTable.module.css */
/* Compact, with clear gaps between cells so the matrix reads at a glance. */
.table {
  border-collapse: separate;
  border-spacing: 6px 4px;
}
.table th {
  font-weight: 600;
  text-align: left;
  vertical-align: bottom;
  padding: 2px 4px;
}
.cell {
  min-width: 64px;
  padding: 4px 6px;
  border-radius: 4px;
  font-weight: 700;
  font-size: var(--mantine-font-size-xs);
}
.unrated {
  border: 1px dashed var(--mantine-color-dark-3);
  color: var(--mantine-color-dimmed);
  background: transparent;
}
```

```tsx
// apps/web/src/features/pairings/RatingsTable.tsx
import {
  CHIP_COLOURS,
  PAIRING_CHIPS,
  type PairingChip,
  type PairingRating,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Menu, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';
import classes from './RatingsTable.module.css';

const darkText = new Set<PairingChip>(['BOUYA', 'Y', 'R']);

/** Our players (rows) against theirs (columns); click a cell to pick its chip. */
export function RatingsTable({
  ours,
  theirs,
  ratings,
  onRate,
}: {
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  ratings: PairingRating[];
  onRate: (playerId: string, opponentPlayerId: string, chip: PairingChip | null) => void;
}) {
  const chipOf = new Map(ratings.map((r) => [`${r.playerId}|${r.opponentPlayerId}`, r.chip]));
  return (
    <Table.ScrollContainer minWidth={560}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th />
            {theirs.map((t) => (
              <th key={t.id}>
                <Tooltip
                  label={
                    <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                      {t.list ?? 'No list'}
                    </Text>
                  }
                  multiline
                  w={320}
                >
                  <span tabIndex={0}>
                    <Text size="xs" c="dimmed">
                      {t.name}
                    </Text>
                    <Text size="sm">{t.faction ?? '—'}</Text>
                    {t.detachments.length > 0 && (
                      <Text size="xs" c="dimmed">
                        {t.detachments.join(' + ')}
                      </Text>
                    )}
                  </span>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ours.map((o) => (
            <tr key={o.id}>
              <th scope="row">
                <Text size="sm">{o.name}</Text>
                <Text size="xs" c="dimmed">
                  {o.faction ?? '—'}
                </Text>
              </th>
              {theirs.map((t) => {
                const chip = chipOf.get(`${o.id}|${t.id}`) ?? null;
                return (
                  <td key={t.id}>
                    <Menu position="bottom" withinPortal>
                      <Menu.Target>
                        <UnstyledButton
                          aria-label={`${o.name} v ${t.name}: ${chip ?? 'unrated'}`}
                          className={chip ? classes.cell : `${classes.cell} ${classes.unrated}`}
                          style={
                            chip
                              ? {
                                  background: CHIP_COLOURS[chip],
                                  color: darkText.has(chip) ? '#111' : '#fff',
                                }
                              : undefined
                          }
                        >
                          {chip ?? '–'}
                        </UnstyledButton>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {PAIRING_CHIPS.map((c) => (
                          <Menu.Item
                            key={c}
                            onClick={() => {
                              onRate(o.id, t.id, c);
                            }}
                          >
                            {c}
                          </Menu.Item>
                        ))}
                        <Menu.Divider />
                        <Menu.Item
                          onClick={() => {
                            onRate(o.id, t.id, null);
                          }}
                        >
                          Clear
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Table.ScrollContainer>
  );
}
```

- [ ] **Step 4: Implement the page, route and team-page link**

```tsx
// apps/web/src/features/pairings/PairingsPage.tsx
import { pointsMatrix } from '@bcp/shared';
import { Alert, Select, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { pairingQuery, pairingTeamsQuery, useSaveRating } from './pairing-queries';
import { RatingsTable } from './RatingsTable';

export function PairingsPage({
  eventId,
  teamId,
  opponentId,
  onOpponentChange,
}: {
  eventId: string;
  teamId: string;
  opponentId: string | null;
  onOpponentChange: (id: string) => void;
}) {
  const teams = useQuery(pairingTeamsQuery(eventId, teamId));
  if (teams.isPending) return <Skeleton height={200} />;
  if (teams.error) return <ErrorState error={teams.error} onRetry={() => void teams.refetch()} />;
  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <AnchorLink to="/events/$eventId/teams/$teamId" params={{ eventId, teamId }}>
          <Text size="sm">← {teams.data.team.name}</Text>
        </AnchorLink>
        <Title order={2}>Pairings</Title>
      </Stack>
      <Select
        label="Opposing team"
        placeholder="Pick a team"
        data={teams.data.opponents.map((t) => ({ value: t.id, label: t.name }))}
        value={opponentId}
        onChange={(v) => {
          if (v) onOpponentChange(v);
        }}
        searchable
        maw={360}
      />
      {opponentId === null ? (
        <Text c="dimmed">Pick the team you play this round.</Text>
      ) : (
        <Matchup eventId={eventId} teamId={teamId} opponentId={opponentId} />
      )}
    </Stack>
  );
}

function Matchup({
  eventId,
  teamId,
  opponentId,
}: {
  eventId: string;
  teamId: string;
  opponentId: string;
}) {
  const data = useQuery(pairingQuery(eventId, teamId, opponentId));
  const save = useSaveRating(eventId, teamId, opponentId);
  if (data.isPending) return <Skeleton height={240} />;
  if (data.error) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />;
  const { ours, theirs, ratings, problem } = data.data;
  if (problem) return <Alert color="yellow">{problem}</Alert>;
  const { rated } = pointsMatrix(
    ours.map((p) => p.id),
    theirs.map((p) => p.id),
    ratings,
  );
  return (
    <Stack gap="lg">
      <Panel title="Rate the games">
        <Stack gap="xs">
          <RatingsTable
            ours={ours}
            theirs={theirs}
            ratings={ratings}
            onRate={(playerId, opponentPlayerId, chip) => {
              save.mutate({ playerId, opponentPlayerId, chip });
            }}
          />
          <Text size="xs" c="dimmed">
            {rated} of 25 rated{rated < 25 ? ' · unrated games count as Y (even)' : ''}
          </Text>
          {save.error && <Alert color="red">Couldn’t save: {save.error.message}</Alert>}
        </Stack>
      </Panel>
    </Stack>
  );
}
```

```tsx
// apps/web/src/routes/events.$eventId_.teams.$teamId_.pairings.tsx
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PairingsPage } from '../features/pairings/PairingsPage';

export const Route = createFileRoute('/events/$eventId_/teams/$teamId_/pairings')({
  validateSearch: z.object({ opponent: z.string().optional() }),
  component: PairingsRoute,
});

function PairingsRoute() {
  const { eventId, teamId } = Route.useParams();
  const { opponent } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PairingsPage
      key={`${eventId}/${teamId}`}
      eventId={eventId}
      teamId={teamId}
      opponentId={opponent ?? null}
      onOpponentChange={(next) => {
        void navigate({ search: { opponent: next }, replace: true });
      }}
    />
  );
}
```

In `TeamPage.tsx`, inside the `<Group gap="md">` under the title, add:

```tsx
<AnchorLink to="/events/$eventId/teams/$teamId/pairings" params={{ eventId, teamId }} search={{}}>
  <Text size="sm">Pairings</Text>
</AnchorLink>
```

Run: `pnpm --filter ./apps/web typecheck` (regenerates `routeTree.gen.ts`; commit the regenerated file).
Note for the executor: if `Panel` has no `title` prop, use the same section header the Mathhammer page uses; if the route id differs after generation, use the generated one.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run --project web apps/web/src/features/pairings apps/web/src/features/analysis/TeamPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm check > /tmp/check.log 2>&1; grep -c "×" /tmp/check.log   # expect 0
git add apps/web
git commit -m "feat: Pairings page where the team rates each game

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Summary and the round-1 defender grid

**Files:**

- Create: `apps/web/src/features/pairings/PairingSummary.tsx`, `apps/web/src/features/pairings/DefenderGrid.tsx`
- Modify: `apps/web/src/features/pairings/PairingsPage.tsx` (compute `analysePairing` with `useMemo`, render summary and grid, hold the selected square in state)
- Test: `apps/web/src/features/pairings/DefenderGrid.test.tsx`

**Interfaces:**

- Consumes: `analysePairing`, `PairingAnalysis` (Task 2), `pointsMatrix` (Task 1).
- Produces: `<PairingSummary analysis ours theirs />`; `<DefenderGrid analysis ours theirs selected={{ d, e }} onSelect={(d, e) => void} />`. The page's selected square defaults to the safe defender against their most likely defender.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/features/pairings/DefenderGrid.test.tsx
import { analysePairing } from '@bcp/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { DefenderGrid } from './DefenderGrid';
import { PairingSummary } from './PairingSummary';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];
const names = (xs: string[]) =>
  xs.map((faction, i) => ({ id: `${i}`, name: `P${i}`, faction, detachments: [], list: null }));
const ours = names([
  'Space Marines',
  "Emperor's Children",
  'Chaos Daemons',
  'World Eaters',
  'Adepta Sororitas',
]);
const theirs = names([
  'Grey Knights',
  'Death Guard',
  'Orks',
  'Chaos Space Marines',
  'Adeptus Custodes',
]);

describe('summary and defender grid', () => {
  it('summarises: expected team score, the safe defender, their likely defender', () => {
    renderWithProviders(
      <PairingSummary analysis={analysePairing(R1)} ours={ours} theirs={theirs} />,
    );
    expect(screen.getByText('49.7')).toBeInTheDocument();
    expect(screen.getByText('Expected team score (of 100)')).toBeInTheDocument();
    // World Eaters is both the safe defender and in the unpredictable mix.
    expect(screen.getAllByText(/World Eaters/).length).toBeGreaterThan(0);
    expect(screen.getByText('Adeptus Custodes')).toBeInTheDocument();
  });

  it('shows every defender pair and selects one on click', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <DefenderGrid
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        selected={{ d: 3, e: 4 }}
        onSelect={onSelect}
      />,
    );
    const cell = screen.getByRole('button', {
      name: 'You defend World Eaters, they defend Chaos Space Marines: 49.1',
    });
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith(3, 3);
    expect(
      screen.getByRole('button', { name: /You defend World Eaters, they defend Adeptus Custodes/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project web apps/web/src/features/pairings/DefenderGrid.test.tsx`
Expected: FAIL, cannot resolve `./DefenderGrid`.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/features/pairings/PairingSummary.tsx
import type { PairingAnalysis, PairingRosterPlayer } from '@bcp/shared';
import { Group, Stack, Text } from '@mantine/core';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function PairingSummary({
  analysis,
  ours,
  theirs,
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
}) {
  const likely = analysis.theirDefender.indexOf(Math.max(...analysis.theirDefender));
  const mix = analysis.ourDefender
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p > 0.005)
    .sort((a, b) => b.p - a.p)
    .map((x) => `${army(ours[x.i])} ${pct(x.p)}`)
    .join(', ');
  const stat = (label: string, value: string, note?: string) => (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={600} className="numeric">
        {value}
      </Text>
      {note && (
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      )}
    </Stack>
  );
  return (
    <Group gap="xl" align="flex-start">
      {stat('Expected team score (of 100)', analysis.value.toFixed(1), '50 is even')}
      {stat(
        'Safe defender',
        army(ours[analysis.safeDefender.index]),
        `at least ${analysis.safeDefender.worst.toFixed(1)}`,
      )}
      {stat('Unpredictable defender', mix, 'pick at random with these odds')}
      {stat('Their likely defender', army(theirs[likely]))}
    </Group>
  );
}
```

```tsx
// apps/web/src/features/pairings/DefenderGrid.tsx
import type { PairingAnalysis, PairingRosterPlayer } from '@bcp/shared';
import { Table, UnstyledButton } from '@mantine/core';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
/** Green above 50, orange below, stronger the further from even. */
const tint = (v: number) => {
  const t = Math.max(-1, Math.min(1, (v - 50) / 4));
  const c = t >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-orange-6)';
  return `color-mix(in srgb, ${c} ${Math.round(Math.abs(t) * 60)}%, transparent)`;
};

export function DefenderGrid({
  analysis,
  ours,
  theirs,
  selected,
  onSelect,
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  selected: { d: number; e: number };
  onSelect: (d: number, e: number) => void;
}) {
  return (
    <Table.ScrollContainer minWidth={420}>
      <Table withRowBorders={false} verticalSpacing={2} fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>You ↓ / them →</Table.Th>
            {theirs.map((t) => (
              <Table.Th key={t.id}>{army(t)}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {analysis.defenderGrid.map((row, d) => (
            <Table.Tr key={ours[d]?.id ?? d}>
              <Table.Th scope="row">{army(ours[d])}</Table.Th>
              {row.map((v, e) => (
                <Table.Td key={theirs[e]?.id ?? e} p={2}>
                  <UnstyledButton
                    className="numeric"
                    aria-label={`You defend ${army(ours[d])}, they defend ${army(theirs[e])}: ${v.toFixed(1)}`}
                    aria-pressed={selected.d === d && selected.e === e}
                    onClick={() => {
                      onSelect(d, e);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'center',
                      padding: '6px 4px',
                      borderRadius: 4,
                      background: tint(v),
                      outline:
                        selected.d === d && selected.e === e
                          ? '2px solid var(--mantine-color-text)'
                          : undefined,
                    }}
                  >
                    {v.toFixed(1)}
                  </UnstyledButton>
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
```

In `PairingsPage.tsx`'s `Matchup`, after the ratings panel:

```tsx
const { points, rated } = pointsMatrix(ours.map((p) => p.id), theirs.map((p) => p.id), ratings);
const analysis = useMemo(() => analysePairing(points), [JSON.stringify(points)]);
const [square, setSquare] = useState<{ d: number; e: number } | null>(null);
const selected = square ?? {
  d: analysis.safeDefender.index,
  e: analysis.theirDefender.indexOf(Math.max(...analysis.theirDefender)),
};
// …
<Panel title="Summary"><PairingSummary analysis={analysis} ours={ours} theirs={theirs} /></Panel>
<Panel title="Round 1 defenders">
  <DefenderGrid analysis={analysis} ours={ours} theirs={theirs} selected={selected}
    onSelect={(d, e) => { setSquare({ d, e }); }} />
</Panel>
```

(Hooks must run before the early returns: move the `useMemo`/`useState` into a child component `Analysis` that receives `ours`, `theirs`, `ratings`, so the hooks are unconditional. Replace `[JSON.stringify(points)]` with a `key` string variable if lint objects to a complex dependency.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run --project web apps/web/src/features/pairings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check > /tmp/check.log 2>&1; grep -c "×" /tmp/check.log   # expect 0
git add apps/web
git commit -m "feat: pairing summary and the round-1 defender grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The chain as a flow diagram

**Files:**

- Create: `apps/web/src/features/pairings/chain-layout.ts`
- Create: `apps/web/src/features/pairings/ChainFlow.tsx`
- Modify: `apps/web/src/features/pairings/PairingsPage.tsx` (render `ChainFlow` beside the grid for the selected square)
- Test: `apps/web/src/features/pairings/chain-layout.test.ts`, `apps/web/src/features/pairings/ChainFlow.test.tsx`

**Interfaces:**

- Consumes: `pairingChain`, `PairingChain`, `ChainLeaf` (Task 3); `PairingAnalysis.attackerOptions` (Task 2).
- Produces: `layoutChain(chain: PairingChain): ChainLayout` where
  `ChainLayout = { width: number; height: number; nodes: ChainBox[]; edges: ChainEdge[] }`,
  `ChainBox = { id: string; column: 0 | 1 | 2 | 3; x: number; y: number; w: number; h: number; kind: 'root' | 'pick' | 'round2' | 'leaf'; share: number; reach: number; value: number; leaf?: ChainLeaf; ref: { send?: number; pick?: number; r2?: number; leaf?: number } }`,
  `ChainEdge = { from: string; to: string; width: number }` (width ∝ the child's `reach`, the probability of reaching it from the start: 1.5 px at least, 14 px for a sure step).
  `<ChainFlow analysis ours theirs d e />` with its own "You send" select (defaults to the option with the highest `share`).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/features/pairings/chain-layout.test.ts
import { analysePairing, pairingChain } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { layoutChain } from './chain-layout';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];

describe('layoutChain', () => {
  const chain = pairingChain(analysePairing(R1), 3, 4, [1, 4]);
  const layout = layoutChain(chain);

  it('one box per step in four columns, every box but the first with one incoming line', () => {
    expect(layout.nodes.filter((n) => n.kind === 'root')).toHaveLength(1);
    const leaves = chain.sends.flatMap((s) =>
      s.picks.flatMap((p) => p.round2.flatMap((r) => r.leaves)),
    );
    expect(layout.nodes.filter((n) => n.kind === 'leaf')).toHaveLength(leaves.length);
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    expect(new Set(layout.nodes.map((n) => n.column))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('boxes in a column never overlap, and likelier steps get thicker lines', () => {
    for (const col of [1, 2, 3]) {
      const boxes = layout.nodes.filter((n) => n.column === col).sort((a, b) => a.y - b.y);
      boxes
        .slice(1)
        .forEach((b, i) =>
          expect(b.y).toBeGreaterThanOrEqual((boxes[i]?.y ?? 0) + (boxes[i]?.h ?? 0)),
        );
    }
    const picks = layout.nodes.filter((n) => n.kind === 'pick').sort((a, b) => b.reach - a.reach);
    const width = (id: string) => layout.edges.find((e) => e.to === id)?.width ?? 0;
    expect(width(picks[0]?.id ?? '')).toBeGreaterThan(width(picks[picks.length - 1]?.id ?? ''));
  });
});
```

```tsx
// apps/web/src/features/pairings/ChainFlow.test.tsx
import { analysePairing } from '@bcp/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { ChainFlow } from './ChainFlow';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];
const names = (xs: string[]) =>
  xs.map((faction, i) => ({ id: `${i}`, name: `P${i}`, faction, detachments: [], list: null }));
const ours = names([
  'Space Marines',
  "Emperor's Children",
  'Chaos Daemons',
  'World Eaters',
  'Adepta Sororitas',
]);
const theirs = names([
  'Grey Knights',
  'Death Guard',
  'Orks',
  'Chaos Space Marines',
  'Adeptus Custodes',
]);

describe('ChainFlow', () => {
  it('draws the chain for the best send and shows a line-up when a final box is clicked', () => {
    renderWithProviders(
      <ChainFlow analysis={analysePairing(R1)} ours={ours} theirs={theirs} d={3} e={4} />,
    );
    expect(
      screen.getByRole('img', {
        name: /Chain: you defend World Eaters, they defend Adeptus Custodes/,
      }),
    ).toBeInTheDocument();
    // The last line-up totalling 50 is the Death Guard + Orks branch (drawn below Grey Knights + Orks).
    const fifties = screen.getAllByRole('button', { name: 'Final line-up, total 50.0' });
    fireEvent.click(fifties.at(-1) as Element);
    expect(screen.getByText('Line-up · Total 50.0')).toBeInTheDocument();
    expect(screen.getAllByText(/World Eaters v Death Guard/).length).toBeGreaterThan(0);
  });

  it('redraws for another send', () => {
    renderWithProviders(
      <ChainFlow analysis={analysePairing(R1)} ours={ours} theirs={theirs} d={3} e={4} />,
    );
    fireEvent.change(screen.getByLabelText('You send'), { target: { value: '0,1' } });
    expect(
      screen.getByRole('img', { name: /you send Space Marines \+ Emperor's Children/ }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run --project web apps/web/src/features/pairings/chain-layout.test.ts apps/web/src/features/pairings/ChainFlow.test.tsx`
Expected: FAIL, cannot resolve `./chain-layout` and `./ChainFlow`.

- [ ] **Step 3: Implement the layout**

```ts
// apps/web/src/features/pairings/chain-layout.ts
import type { ChainLeaf, PairingChain } from '@bcp/shared';

export interface ChainBox {
  id: string;
  column: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'root' | 'pick' | 'round2' | 'leaf';
  /** Share of the step before. */
  share: number;
  /** Probability of reaching this step from the start. */
  reach: number;
  value: number;
  leaf?: ChainLeaf;
  ref: { send?: number; pick?: number; r2?: number; leaf?: number };
}
export interface ChainEdge {
  from: string;
  to: string;
  width: number;
}
export interface ChainLayout {
  width: number;
  height: number;
  nodes: ChainBox[];
  edges: ChainEdge[];
}

const COLS = [0, 190, 400, 610];
const WIDTHS = [170, 190, 190, 230];
const H = { root: 64, pick: 64, round2: 48, leaf: 40 };
const GAP = 8;
const lineWidth = (reach: number) => Math.max(1.5, reach * 14);

/**
 * Left to right: our round-1 decision, their send with both picks, round-2 defenders, final line-up.
 * Leaves are stacked top to bottom; every parent sits at the middle of its children.
 */
export function layoutChain(chain: PairingChain): ChainLayout {
  const nodes: ChainBox[] = [];
  const edges: ChainEdge[] = [];
  let cursor = 0;
  const place = (box: Omit<ChainBox, 'x' | 'y' | 'w'> & { y?: number }): ChainBox => {
    const full: ChainBox = {
      ...box,
      x: COLS[box.column] ?? 0,
      w: WIDTHS[box.column] ?? 160,
      y: box.y ?? 0,
    };
    nodes.push(full);
    return full;
  };
  const middle = (kids: ChainBox[], h: number) =>
    kids.length === 0
      ? cursor
      : ((kids[0]?.y ?? 0) + ((kids.at(-1)?.y ?? 0) + (kids.at(-1)?.h ?? 0))) / 2 - h / 2;

  const pickBoxes: ChainBox[] = [];
  chain.sends.forEach((send, si) =>
    send.picks.forEach((pick, pi) => {
      const reachPick = send.p * pick.p;
      const r2Boxes: ChainBox[] = [];
      pick.round2.forEach((r2, ri) => {
        const reachR2 = reachPick * r2.p;
        const leafBoxes = r2.leaves.map((leaf, li) => {
          const box = place({
            id: `l-${si}-${pi}-${ri}-${li}`,
            column: 3,
            h: H.leaf,
            y: cursor,
            kind: 'leaf',
            share: leaf.p,
            reach: reachR2 * leaf.p,
            value: leaf.total,
            leaf,
            ref: { send: si, pick: pi, r2: ri, leaf: li },
          });
          cursor += H.leaf + GAP;
          return box;
        });
        const r2Box = place({
          id: `r-${si}-${pi}-${ri}`,
          column: 2,
          h: H.round2,
          y: middle(leafBoxes, H.round2),
          kind: 'round2',
          share: r2.p,
          reach: reachR2,
          value: r2.value,
          ref: { send: si, pick: pi, r2: ri },
        });
        leafBoxes.forEach((l) =>
          edges.push({ from: r2Box.id, to: l.id, width: lineWidth(l.reach) }),
        );
        r2Boxes.push(r2Box);
        cursor += GAP;
      });
      const pickBox = place({
        id: `p-${si}-${pi}`,
        column: 1,
        h: H.pick,
        y: middle(r2Boxes, H.pick),
        kind: 'pick',
        share: send.p * pick.p,
        reach: reachPick,
        value: pick.value,
        ref: { send: si, pick: pi },
      });
      r2Boxes.forEach((r) => edges.push({ from: pickBox.id, to: r.id, width: lineWidth(r.reach) }));
      pickBoxes.push(pickBox);
      cursor += GAP * 2;
    }),
  );
  const root = place({
    id: 'root',
    column: 0,
    h: H.root,
    y: Math.max(0, middle(pickBoxes, H.root)),
    kind: 'root',
    share: 1,
    reach: 1,
    value: chain.value,
    ref: {},
  });
  pickBoxes.forEach((p) => edges.push({ from: root.id, to: p.id, width: lineWidth(p.reach) }));
  const height = Math.max(...nodes.map((n) => n.y + n.h), H.root);
  return { width: (COLS[3] ?? 0) + (WIDTHS[3] ?? 0), height, nodes, edges };
}
```

- [ ] **Step 4: Implement the component**

```tsx
// apps/web/src/features/pairings/ChainFlow.tsx
import {
  CHIP_COLOURS,
  pairingChain,
  type ChainLeaf,
  type PairingAnalysis,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { NativeSelect, Stack, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { layoutChain, type ChainBox } from './chain-layout';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The chain for one pair of round-1 defenders, as a flow diagram; click a final box for its line-up. */
export function ChainFlow({
  analysis,
  ours,
  theirs,
  d,
  e,
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  d: number;
  e: number;
}) {
  const options = analysis.attackerOptions(d, e);
  const best = options.reduce((x, y) => (y.share > x.share ? y : x));
  const [sendKey, setSendKey] = useState<string | null>(null);
  const send = options.find((o) => o.pair.join() === sendKey) ?? best;
  const chain = useMemo(() => pairingChain(analysis, d, e, send.pair), [analysis, d, e, send.pair]);
  const layout = useMemo(() => layoutChain(chain), [chain]);
  const [picked, setPicked] = useState<ChainLeaf | null>(null);
  const label = (box: ChainBox): string[] => {
    const s = box.ref.send !== undefined ? chain.sends[box.ref.send] : undefined;
    const p = s && box.ref.pick !== undefined ? s.picks[box.ref.pick] : undefined;
    const r = p && box.ref.r2 !== undefined ? p.round2[box.ref.r2] : undefined;
    if (box.kind === 'root')
      return [`You: ${army(ours[d])}`, `Them: ${army(theirs[e])}`, `→ ${chain.value.toFixed(1)}`];
    if (box.kind === 'pick' && s && p)
      return [
        `They send ${s.theirs.map((t) => army(theirs[t])).join(' + ')} · ${pct(box.share)}`,
        `${army(ours[d])} v ${army(theirs[p.weTake])}`,
        `${army(ours[p.theyTake])} v ${army(theirs[e])} → ${box.value.toFixed(1)}`,
      ];
    if (box.kind === 'round2' && r)
      return [
        `R2 · ${pct(r.p)}: you ${army(ours[r.d])}`,
        `them ${army(theirs[r.e])} → ${box.value.toFixed(1)}`,
      ];
    return [`${box.leaf ? `Total ${box.value.toFixed(1)}` : ''} · ${pct(box.share)}`];
  };
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  return (
    <Stack gap="sm">
      <NativeSelect
        label="You send"
        value={send.pair.join()}
        onChange={(ev) => {
          setSendKey(ev.currentTarget.value);
          setPicked(null);
        }}
        data={options.map((o) => ({
          value: o.pair.join(),
          label: `${o.pair.map((a) => army(ours[a])).join(' + ')} (${o.likely.toFixed(1)}${o === best ? ', best' : ''})`,
        }))}
        maw={420}
      />
      <div style={{ overflowX: 'auto' }}>
        <svg
          role="img"
          aria-label={`Chain: you defend ${army(ours[d])}, they defend ${army(theirs[e])}, you send ${send.pair.map((a) => army(ours[a])).join(' + ')}`}
          width={layout.width}
          height={layout.height + 4}
          viewBox={`0 -2 ${layout.width} ${layout.height + 4}`}
          style={{ font: '11px var(--mantine-font-family)' }}
        >
          {layout.edges.map((edge) => {
            const a = byId.get(edge.from);
            const b = byId.get(edge.to);
            if (!a || !b) return null;
            const x1 = a.x + a.w,
              y1 = a.y + a.h / 2,
              x2 = b.x,
              y2 = b.y + b.h / 2,
              mid = (x1 + x2) / 2;
            return (
              <path
                key={edge.to}
                d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
                fill="none"
                stroke="var(--mantine-color-teal-6)"
                strokeOpacity={0.55}
                strokeWidth={edge.width}
              />
            );
          })}
          {layout.nodes.map((box) => {
            const leaf = box.leaf;
            const lines = label(box);
            const fill =
              leaf && picked === leaf ? 'var(--mantine-color-dark-5)' : 'var(--mantine-color-body)';
            const stroke =
              box.value >= 50 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-orange-6)';
            const content = (
              <>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={6}
                  fill={fill}
                  stroke={stroke}
                />
                {lines.map((line, i) => (
                  <text
                    key={i}
                    x={box.x + 8}
                    y={box.y + 15 + i * 14}
                    fill="var(--mantine-color-text)"
                  >
                    {line}
                  </text>
                ))}
              </>
            );
            return leaf ? (
              <g
                key={box.id}
                role="button"
                tabIndex={0}
                aria-label={`Final line-up, total ${box.value.toFixed(1)}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setPicked(leaf);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') setPicked(leaf);
                }}
              >
                {content}
              </g>
            ) : (
              <g key={box.id}>{content}</g>
            );
          })}
        </svg>
      </div>
      {picked && (
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            Line-up · Total {picked.total.toFixed(1)}
          </Text>
          {picked.games.map(([a, b]) => {
            const v = analysis.game.pt(a, b);
            return (
              <Text key={`${a}-${b}`} size="sm">
                {army(ours[a])} v {army(theirs[b])} <span className="numeric">{v}</span>
              </Text>
            );
          })}
        </Stack>
      )}
      {chain.other > 0.005 && (
        <Text size="xs" c="dimmed">
          Other lines: {pct(chain.other)}
        </Text>
      )}
    </Stack>
  );
}
```

`CHIP_COLOURS` is imported for the chips in the line-up text if you add them; remove the import if unused.

In `PairingsPage.tsx`'s analysis section, place the grid and the chain side by side (a `SimpleGrid cols={{ base: 1, md: 3 }}` with the grid in one column and `<ChainFlow analysis={analysis} ours={ours} theirs={theirs} d={selected.d} e={selected.e} key={`${selected.d}-${selected.e}`} />` spanning two).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run --project web apps/web/src/features/pairings`
Expected: PASS.

- [ ] **Step 6: Look at it in the browser**

Start the dev servers from `.claude/launch.json` (preview tools), open `/events/<an event with 5-player teams>/teams/<team>/pairings?opponent=<other team>`, rate a few cells, click a defender square, change the send, click a final box. Stop the preview servers afterwards (the user's dev uses ports 3401/5273).

- [ ] **Step 7: Commit**

```bash
pnpm check > /tmp/check.log 2>&1; grep -c "×" /tmp/check.log   # expect 0
git add apps/web
git commit -m "feat: the pairing chain as a flow diagram with line-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
