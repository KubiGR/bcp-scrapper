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
