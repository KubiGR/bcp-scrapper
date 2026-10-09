import { analysePairing, solveMatrixGame } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { withRuledOut } from './ruled-out';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];

describe('withRuledOut', () => {
  const analysis = analysePairing(R1);

  it('nothing ruled out: the analysis as it is', () => {
    const view = withRuledOut(analysis, new Set());
    expect(view.value).toBe(analysis.value);
    expect(view.theirDefender).toEqual(analysis.theirDefender);
    expect(view.ourDefender).toEqual(analysis.ourDefender);
    expect(view.safeDefender).toEqual(analysis.safeDefender);
  });

  it('their defenders ruled out: the defender game solved again without them', () => {
    const kept = [0, 1, 2, 3];
    const game = solveMatrixGame(analysis.defenderGrid.map((row) => kept.map((e) => row[e] ?? 0)));
    const view = withRuledOut(analysis, new Set([4]));
    expect(view.value).toBeCloseTo(game.value, 9);
    expect(view.ourDefender).toEqual(game.rows);
    expect(view.theirDefender).toEqual([...game.cols, 0]);
    // The safe defender: the best worst case over the defenders left.
    const worst = analysis.defenderGrid.map((row) => Math.min(...kept.map((e) => row[e] ?? 0)));
    expect(view.safeDefender.worst).toBe(Math.max(...worst));
    expect(view.safeDefender.index).toBe(worst.indexOf(Math.max(...worst)));
  });
});
