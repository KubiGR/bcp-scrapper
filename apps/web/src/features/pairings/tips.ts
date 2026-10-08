import type { Pair, PairingAnalysis } from '@bcp/shared';
import type { ChainFollow } from './chain-layout';

/** One option for our next decision: whose player (`index`), and how it goes. */
export interface TipOption {
  index: number;
  /** How often the model would choose it (a mix when two are about equally good). */
  chance: number;
  /** Team score (of 100) if they play as the model expects. */
  expected: number;
  /** Team score if they make the choice that is worst for us. */
  worst: number;
}

export interface Tip {
  step: 'You take' | 'Your round-2 defender' | 'Round-2 take';
  /** Whose players the options are: their attackers to take, or our round-2 defenders. */
  side: 'ours' | 'theirs';
  /** Best first: the model's likeliest choice. */
  options: TipOption[];
  /** Every option leads to the same score, expected and worst: take any. */
  same: boolean;
}

const ALL = [0, 1, 2, 3, 4];
/** Scores closer than this read the same (they show to one decimal). */
const SAME = 0.05;
const tip = (step: Tip['step'], side: Tip['side'], list: TipOption[]): Tip => {
  const top = list[0];
  const same =
    top !== undefined &&
    list.every(
      (o) => Math.abs(o.expected - top.expected) < SAME && Math.abs(o.worst - top.worst) < SAME,
    );
  return { step, side, options: list, same };
};
const without = (list: number[], ...drop: number[]) => list.filter((x) => !drop.includes(x));

/** A decision table's rows as options: against their mix (`cols`) and their best reply. */
function options(
  indexes: number[],
  t: { table: number[][]; rows: number[]; cols: number[] },
  locked: number,
): TipOption[] {
  return indexes
    .map((index, i) => {
      const row = t.table[i] ?? [];
      return {
        index,
        chance: t.rows[i] ?? 0,
        expected: locked + row.reduce((sum, v, j) => sum + v * (t.cols[j] ?? 0), 0),
        worst: locked + Math.min(...row),
      };
    })
    .sort((a, b) => b.chance - a.chance || b.expected - a.expected);
}

/**
 * Our team's next decision in a live pairing, given what has happened (round-1 defenders `d`, `e`
 * and our send are already chosen): which of their attackers to take, then our round-2 defender,
 * then which of their round-2 attackers to take. Null while it's their move.
 */
export function nextTip(
  analysis: PairingAnalysis,
  d: number,
  e: number,
  ourSend: Pair,
  follow: ChainFollow,
): Tip | null {
  const { game } = analysis;
  const theirSend = follow.theirSend?.split(',').map(Number) as Pair | undefined;
  if (!theirSend) return null;
  if (follow.weTake === undefined) {
    const c = game.choices(ALL, ALL, d, e, ourSend, theirSend);
    return tip('You take', 'theirs', options(theirSend, c, 0));
  }
  if (follow.theyTake === undefined) return null;
  // Round 2 works on the players left; the two round-1 games are already locked.
  const A = without(ALL, d, follow.theyTake);
  const B = without(ALL, e, follow.weTake);
  const locked = game.pt(d, follow.weTake) + game.pt(follow.theyTake, e);
  if (follow.ourR2 === undefined) {
    return tip('Your round-2 defender', 'ours', options(A, game.defenders(A, B), locked));
  }
  if (follow.theirR2 === undefined) return null;
  const ourPair = without(A, follow.ourR2) as Pair;
  const theirPair = without(B, follow.theirR2) as Pair;
  const c = game.choices(A, B, follow.ourR2, follow.theirR2, ourPair, theirPair);
  return tip('Round-2 take', 'theirs', options(theirPair, c, locked));
}
