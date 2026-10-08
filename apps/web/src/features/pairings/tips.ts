import type { Pair, PairingAnalysis } from '@bcp/shared';
import type { ChainFollow } from './chain-layout';

/** One option for our next decision: whose player (`index`), and how it goes. */
export interface TipOption {
  index: number;
  /** How often the model would choose it (a mix when two are about equally good). */
  chance: number;
  /** Team score (of 100) if they play as the model expects. */
  expected: number;
  /** Team score if they make the choice that is best for us. */
  best: number;
  /** Team score if they make the choice that is worst for us. */
  worst: number;
  /** Team score against each of their answers (in `replies` order). */
  scores: number[];
}

/** Their answers to our decision: which of our players their defender takes, or who they defend. */
export interface TipReplies {
  /** Whose players the answers are named by. */
  side: 'ours' | 'theirs';
  verb: 'take' | 'defend';
  /** Each answer with how likely the model thinks it is. */
  list: { index: number; chance: number }[];
}

export interface Tip {
  step: 'You take' | 'Your round-2 defender' | 'Round-2 take';
  /** Whose players the options are: their attackers to take, or our round-2 defenders. */
  side: 'ours' | 'theirs';
  /** Best first: by expected score, then worst case, then upside. */
  options: TipOption[];
  replies: TipReplies;
  /** Every option leads to the same scores (expected, best and worst): take any. */
  same: boolean;
  /**
   * The option (by `index`) whose worst already reaches the expected score: it guarantees the
   * best we can expect, so take it outright (any mix the solver returned is one of several equally
   * good ones). Null when every option can be punished, and mixing is what keeps us safe.
   */
  safe: number | null;
}

const ALL = [0, 1, 2, 3, 4];
/** Scores closer than this read the same (they show to one decimal). */
const SAME = 0.05;
/**
 * Higher first by each score in turn; scores that read the same (one decimal) fall through to the
 * next, and then to the model's chance.
 */
const byScore =
  (...keys: ('expected' | 'worst' | 'best')[]) =>
  (a: TipOption, b: TipOption): number => {
    for (const key of keys) {
      const diff = b[key] - a[key];
      if (Math.abs(diff) >= SAME) return diff;
    }
    return b.chance - a.chance;
  };

export function toTip(
  step: Tip['step'],
  side: Tip['side'],
  list: TipOption[],
  replies: TipReplies,
): Tip {
  const top = list[0];
  const same =
    top !== undefined &&
    list.every(
      (o) =>
        Math.abs(o.expected - top.expected) < SAME &&
        Math.abs(o.best - top.best) < SAME &&
        Math.abs(o.worst - top.worst) < SAME,
    );
  const value = Math.max(...list.map((o) => o.expected));
  const sure = list
    .filter((o) => o.worst >= value - SAME)
    .sort((a, b) => b.worst - a.worst || b.expected - a.expected)[0];
  // The guaranteed option goes first; then by expected score, worst case and upside.
  const ranked = [...list].sort(byScore('expected', 'worst', 'best'));
  const options = sure ? [sure, ...ranked.filter((o) => o !== sure)] : ranked;
  return { step, side, options, replies, same, safe: sure && !same ? sure.index : null };
}

/** With no read, the safest single pick: the best worst case (then the better expected). */
export function safest(tip: Tip): TipOption | undefined {
  return [...tip.options].sort(byScore('worst', 'expected', 'best'))[0];
}

/** With a read that they'll make answer `reply` (its place in `replies.list`): our best option. */
export function bestAgainst(tip: Tip, reply: number): TipOption | undefined {
  return [...tip.options].sort((a, b) => (b.scores[reply] ?? 0) - (a.scores[reply] ?? 0))[0];
}

/**
 * For a two-way choice against two answers: how likely their first answer must be for `above` to
 * beat `below`. Null when one option is at least as good against both (no read changes it).
 */
export function breakEven(
  tip: Tip,
): { share: number; reply: number; above: number; below: number } | null {
  const [a, b] = tip.options;
  const first = tip.replies.list[0];
  if (!a || !b || tip.options.length !== 2 || tip.replies.list.length !== 2 || !first) return null;
  const [a1 = 0, a2 = 0] = a.scores;
  const [b1 = 0, b2 = 0] = b.scores;
  // a1·q + a2·(1−q) = b1·q + b2·(1−q)
  const slope = a1 - a2 - (b1 - b2);
  if (Math.abs(slope) < 1e-9) return null;
  const share = (b2 - a2) / slope;
  if (share <= 0 || share >= 1) return null;
  // The option better against their first answer wins when that answer is likelier.
  const [above, below] = a1 >= b1 ? [a, b] : [b, a];
  return { share, reply: first.index, above: above.index, below: below.index };
}
const without = (list: number[], ...drop: number[]) => list.filter((x) => !drop.includes(x));

/** A decision table's rows as options: against their mix (`cols`) and their best reply. */
function options(
  indexes: number[],
  t: { table: number[][]; rows: number[]; cols: number[] },
  locked: number,
): TipOption[] {
  return indexes
    .map((index, i) => {
      const scores = (t.table[i] ?? []).map((v) => locked + v);
      return {
        index,
        chance: t.rows[i] ?? 0,
        expected: scores.reduce((sum, v, j) => sum + v * (t.cols[j] ?? 0), 0),
        best: Math.max(...scores),
        worst: Math.min(...scores),
        scores,
      };
    })
    .sort((a, b) => b.chance - a.chance || b.expected - a.expected);
}

const repliesOf = (
  side: TipReplies['side'],
  verb: TipReplies['verb'],
  indexes: number[],
  cols: number[],
): TipReplies => ({
  side,
  verb,
  list: indexes.map((index, j) => ({ index, chance: cols[j] ?? 0 })),
});

/**
 * Our team's next decision in a live pairing, given what has happened (round-1 defenders `d`, `e`
 * and our send are already chosen): which of their attackers to take, then our round-2 defender,
 * then which of their round-2 attackers to take. Null while it's their move, and once we've taken.
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
    return toTip(
      'You take',
      'theirs',
      options(theirSend, c, 0),
      repliesOf('ours', 'take', ourSend, c.cols),
    );
  }
  if (follow.theyTake === undefined) return null;
  // Round 2 works on the players left; the two round-1 games are already locked.
  const A = without(ALL, d, follow.theyTake);
  const B = without(ALL, e, follow.weTake);
  const locked = game.pt(d, follow.weTake) + game.pt(follow.theyTake, e);
  if (follow.ourR2 === undefined) {
    const t = game.defenders(A, B);
    return toTip(
      'Your round-2 defender',
      'ours',
      options(A, t, locked),
      repliesOf('theirs', 'defend', B, t.cols),
    );
  }
  if (follow.theirR2 === undefined || follow.weTake2 !== undefined) return null;
  const ourPair = without(A, follow.ourR2) as Pair;
  const theirPair = without(B, follow.theirR2) as Pair;
  const c = game.choices(A, B, follow.ourR2, follow.theirR2, ourPair, theirPair);
  return toTip(
    'Round-2 take',
    'theirs',
    options(theirPair, c, locked),
    repliesOf('ours', 'take', ourPair, c.cols),
  );
}
