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
    a.defenderGrid.flat().forEach((v) => {
      expect(v).toBeCloseTo(50, 9);
    });
  });

  it('a team better in every game scores above 50', () => {
    const better = Array.from({ length: 5 }, () => [13, 13, 17, 13, 13]);
    expect(analysePairing(better).value).toBeGreaterThan(50);
  });

  it('solves the whole tree in under 100 ms', () => {
    // Each run solves from scratch; the fastest of three keeps a busy test machine from failing it.
    const runs = Array.from({ length: 3 }, () => {
      const start = performance.now();
      analysePairing(R1);
      return performance.now() - start;
    });
    expect(Math.min(...runs)).toBeLessThan(100);
  });
});
