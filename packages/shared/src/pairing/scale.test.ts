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
