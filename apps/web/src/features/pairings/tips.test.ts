import { analysePairing } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { bestAgainst, breakEven, nextTip, safest, toTip } from './tips';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];
const analysis = analysePairing(R1);
// The tip from the live pairing: Orks or Death Guard, against their defender taking X (1) or Y (4).
const MIX = [
  { index: 2, chance: 0.6, expected: 50.1, best: 50.6, worst: 49.2, scores: [50.6, 49.2] },
  { index: 1, chance: 0.4, expected: 50.1, best: 51.5, worst: 49.5, scores: [49.5, 51.5] },
];
const MIX_REPLIES = {
  side: 'ours' as const,
  verb: 'take' as const,
  list: [
    { index: 1, chance: 0.68 },
    { index: 4, chance: 0.32 },
  ],
};
const { game } = analysis;
const ALL = [0, 1, 2, 3, 4];
// We defend World Eaters (3), they Custodes (4); we send Emperor's Children + Sororitas (1, 4).
const d = 3;
const e = 4;

describe('nextTip', () => {
  it('no tip until they have sent their attackers', () => {
    expect(nextTip(analysis, d, e, [1, 4], {})).toBeNull();
  });

  it('which of their attackers to take: each option’s expected and worst total, best first', () => {
    const tip = nextTip(analysis, d, e, [1, 4], { theirSend: '1,2' });
    expect(tip?.step).toBe('You take');
    expect(tip?.side).toBe('theirs');
    const c = game.choices(ALL, ALL, d, e, [1, 4], [1, 2]);
    const expected = c.table.map((row) => row.reduce((s, v, j) => s + v * (c.cols[j] ?? 0), 0));
    expect(tip?.options.map((o) => o.index).sort()).toEqual([1, 2]);
    for (const o of tip?.options ?? []) {
      const i = o.index === 1 ? 0 : 1;
      expect(o.expected).toBeCloseTo(expected[i] ?? 0, 9);
      expect(o.worst).toBeCloseTo(Math.min(...(c.table[i] ?? [])), 9);
      expect(o.best).toBeCloseTo(Math.max(...(c.table[i] ?? [])), 9);
      expect(o.chance).toBeCloseTo(c.rows[i] ?? 0, 9);
    }
    expect(tip?.options[0]?.chance).toBe(Math.max(...(tip?.options.map((o) => o.chance) ?? [])));
  });

  it('the round-2 defender, counting the round-1 games already locked', () => {
    // Round 1: we took Orks (2), they took Emperor's Children (1).
    const tip = nextTip(analysis, d, e, [1, 4], { theirSend: '1,2', weTake: 2, theyTake: 1 });
    expect(tip?.step).toBe('Your round-2 defender');
    expect(tip?.side).toBe('ours');
    expect(tip?.options.map((o) => o.index).sort()).toEqual([0, 2, 4]);
    const locked = (R1[3]?.[2] ?? 0) + (R1[1]?.[4] ?? 0);
    const t = game.defenders([0, 2, 4], [0, 1, 3]);
    const sm = tip?.options.find((o) => o.index === 0);
    expect(sm?.worst).toBeCloseTo(locked + Math.min(...(t.table[0] ?? [])), 9);
  });

  it('then which of their round-2 attackers to take', () => {
    const tip = nextTip(analysis, d, e, [1, 4], {
      theirSend: '1,2',
      weTake: 2,
      theyTake: 1,
      ourR2: 0,
      theirR2: 3,
    });
    expect(tip?.step).toBe('Round-2 take');
    expect(tip?.side).toBe('theirs');
    expect(tip?.options.map((o) => o.index).sort()).toEqual([0, 1]);
  });

  it('says when the options come to the same', () => {
    const tip = nextTip(analysis, d, e, [1, 4], { theirSend: '1,2' });
    expect(typeof tip?.same).toBe('boolean');
    const flat = analysePairing(Array.from({ length: 5 }, () => [10, 10, 10, 10, 10]));
    expect(nextTip(flat, 0, 0, [1, 2], { theirSend: '1,2' })?.same).toBe(true);
  });

  it('an option whose worst already reaches the expected score is recommended outright, not mixed', () => {
    // As the solver can return: a 92/8 mix although Chaos Daemons alone guarantees 51.5.
    const tip = toTip(
      'Your round-2 defender',
      'ours',
      [
        { index: 2, chance: 0.92, expected: 51.5, best: 52, worst: 51.5, scores: [51.5, 52] },
        { index: 4, chance: 0.08, expected: 51.5, best: 52, worst: 46, scores: [52, 46] },
      ],
      { side: 'theirs', verb: 'defend', list: [] },
    );
    expect(tip.safe).toBe(2);
    expect(tip.options[0]?.index).toBe(2);
    // A real mix: every option can be punished below the expected score.
    const mix = toTip('You take', 'theirs', MIX, MIX_REPLIES);
    expect(mix.safe).toBeNull();
  });

  it('each option scores against each of their answers, named and with their odds', () => {
    const tip = nextTip(analysis, d, e, [1, 4], { theirSend: '1,2' });
    // Their defender takes one of our attackers: Emperor's Children (1) or Sororitas (4).
    expect(tip?.replies.side).toBe('ours');
    expect(tip?.replies.verb).toBe('take');
    expect(tip?.replies.list.map((r) => r.index)).toEqual([1, 4]);
    const c = game.choices(ALL, ALL, d, e, [1, 4], [1, 2]);
    for (const o of tip?.options ?? []) expect(o.scores).toEqual(c.table[o.index === 1 ? 0 : 1]);
    expect(tip?.replies.list.map((r) => r.chance)).toEqual(c.cols);
  });

  it('with a read on their answer, the option that does best against it', () => {
    const tip = toTip('You take', 'theirs', MIX, MIX_REPLIES);
    expect(bestAgainst(tip, 0)?.index).toBe(2); // they take X: Orks 50.6
    expect(bestAgainst(tip, 1)?.index).toBe(1); // they take Y: Death Guard 51.5
  });

  it('the break-even for a two-way choice: above it one option, below it the other', () => {
    const tip = toTip('You take', 'theirs', MIX, MIX_REPLIES);
    const even = breakEven(tip);
    // 50.6q + 49.2(1−q) = 49.5q + 51.5(1−q)  →  q = 2.3 / 3.4
    expect(even?.share).toBeCloseTo(2.3 / 3.4, 9);
    expect(even?.reply).toBe(1);
    expect(even?.above).toBe(2);
    expect(even?.below).toBe(1);
  });

  it('with no read, the safest single pick is the one with the highest worst case', () => {
    expect(safest(toTip('You take', 'theirs', MIX, MIX_REPLIES))?.index).toBe(1); // Death Guard, 49.5
  });
});
