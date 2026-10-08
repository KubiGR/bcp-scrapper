import { analysePairing } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { nextTip } from './tips';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];
const analysis = analysePairing(R1);
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
});
