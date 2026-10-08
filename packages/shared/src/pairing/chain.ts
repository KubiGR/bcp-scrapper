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
    q.forEach((b, bi) => {
      p.forEach((a, ai) => {
        const w = (c.rows[bi] ?? 0) * (c.cols[ai] ?? 0);
        if (w > EPS) out.push({ p: w, b, a });
      });
    });
    return out;
  };

  const round2 = (A: number[], B: number[], locked: Pair[]): ChainRound2[] => {
    const t = game.defenders(A, B);
    const nodes: ChainRound2[] = [];
    A.forEach((d2, di) => {
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
      });
    });
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
