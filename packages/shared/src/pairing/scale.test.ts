import { describe, expect, it } from 'vitest';
import { CHIP_POINTS, pointsMatrix, ratingPoints } from './scale';

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

  it('a chip that can become another counts two thirds the first and one third the second', () => {
    expect(ratingPoints('Y', 'R')).toBeCloseTo(9, 9);
    expect(ratingPoints('G', 'GG')).toBeCloseTo(43 / 3, 9);
    expect(ratingPoints('G')).toBe(13);
    const { points } = pointsMatrix(
      ['a'],
      ['x'],
      [{ playerId: 'a', opponentPlayerId: 'x', chip: 'Y', alt: 'R' }],
    );
    expect(points[0]?.[0]).toBeCloseTo(9, 9);
  });
});
