import type { Pair, PairingAnalysis } from './pairing';

/** A step's chance `p` is our chance of choosing it times theirs; no pick or round-2 defender of either side is left out. */
export interface ChainChances {
  p: number;
  ourChance: number;
  theirChance: number;
}
export interface ChainLeaf extends ChainChances {
  weTake: number;
  theyTake: number;
  last: Pair;
  games: Pair[];
  total: number;
}
export interface ChainRound2 extends ChainChances {
  d: number;
  e: number;
  ours: Pair;
  theirs: Pair;
  value: number;
  leaves: ChainLeaf[];
  other: number;
}
export interface ChainPick extends ChainChances {
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

  /**
   * The simultaneous picks: our defender takes `b` from `q`, theirs takes `a` from `p`. Neither
   * side's pick is assumed: all four come, each with both sides' chances.
   */
  const picks = (A: number[], B: number[], dd: number, ee: number, p: Pair, q: Pair) => {
    const c = game.choices(A, B, dd, ee, p, q);
    return q.flatMap((b, bi) =>
      p.map((a, ai) => {
        const ourChance = c.rows[bi] ?? 0;
        const theirChance = c.cols[ai] ?? 0;
        return { p: ourChance * theirChance, ourChance, theirChance, b, a };
      }),
    );
  };

  /** Round 2 after the given games: every pair of defenders, then every pair of picks. */
  const round2 = (A: number[], B: number[], locked: Pair[]): ChainRound2[] => {
    const t = game.defenders(A, B);
    return A.flatMap((d2, di) =>
      B.map((e2, ei): ChainRound2 => {
        const ourPair = without(A, d2) as Pair;
        const theirPair = without(B, e2) as Pair;
        const leaves = picks(A, B, d2, e2, ourPair, theirPair).map((x): ChainLeaf => {
          const last: Pair = [without(ourPair, x.a)[0] ?? 0, without(theirPair, x.b)[0] ?? 0];
          const games: Pair[] = [...locked, [d2, x.b], [x.a, e2], last];
          return {
            p: x.p,
            ourChance: x.ourChance,
            theirChance: x.theirChance,
            weTake: x.b,
            theyTake: x.a,
            last,
            games,
            total: games.reduce((sum, [g, h]) => sum + pt(g, h), 0),
          };
        });
        const ourChance = t.rows[di] ?? 0;
        const theirChance = t.cols[ei] ?? 0;
        return {
          p: ourChance * theirChance,
          ourChance,
          theirChance,
          d: d2,
          e: e2,
          ours: ourPair,
          theirs: theirPair,
          value: weighted(leaves, (l) => l.total),
          leaves,
          other: 0,
        };
      }),
    );
  };

  const s = game.attackers(ALL, ALL, d, e);
  const sends: ChainSend[] = [];
  s.theirs.forEach((q, j) => {
    const pq = s.cols[j] ?? 0;
    if (pq <= EPS) return;
    const pickNodes = picks(ALL, ALL, d, e, ours, q).map((x): ChainPick => {
      const nodes = round2(without(ALL, d, x.a), without(ALL, e, x.b), [
        [d, x.b],
        [x.a, e],
      ]);
      return {
        p: x.p,
        ourChance: x.ourChance,
        theirChance: x.theirChance,
        weTake: x.b,
        theyTake: x.a,
        value: weighted(nodes, (n) => n.value),
        round2: nodes,
        other: 0,
      };
    });
    sends.push({
      p: pq,
      theirs: q,
      value: weighted(pickNodes, (x) => x.value),
      picks: pickNodes,
      other: 0,
    });
  });
  const { kept, other } = fold(sends);
  return { d, e, ours, value: weighted(sends, (x) => x.value), sends: kept, other };
}
