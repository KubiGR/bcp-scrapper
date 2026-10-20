import { describe, expect, it } from 'vitest';
import { computeElo, ELO_START } from './elo';

describe('computeElo', () => {
  it('starts everyone at 1500 and moves a win between equals by 16 each way', () => {
    const ratings = computeElo([{ a: 'A', b: 'B', result: 'a_win' }]);
    expect(ratings.get('A')).toEqual({ elo: 1516, games: 1, wins: 1, losses: 0, draws: 0 });
    expect(ratings.get('B')).toEqual({ elo: 1484, games: 1, wins: 0, losses: 1, draws: 0 });
    expect(ELO_START).toBe(1500);
  });

  it('leaves a draw between equals where it was', () => {
    const ratings = computeElo([{ a: 'A', b: 'B', result: 'draw' }]);
    expect(ratings.get('A')?.elo).toBe(1500);
    expect(ratings.get('B')).toMatchObject({ elo: 1500, draws: 1 });
  });

  it('pays more for beating a stronger player than a weaker one, in game order', () => {
    const ratings = computeElo([
      { a: 'Strong', b: 'X', result: 'a_win' },
      { a: 'Strong', b: 'Y', result: 'a_win' },
      // Beating Strong (now ~1531) earns Upset more than Strong earned for its first win.
      { a: 'Upset', b: 'Strong', result: 'a_win' },
      { a: 'B', b: 'Weak', result: 'b_win' },
    ]);
    const upsetGain = (ratings.get('Upset')?.elo ?? 0) - ELO_START;
    expect(upsetGain).toBeGreaterThan(16);
    expect(ratings.get('Strong')?.games).toBe(3);
    expect(ratings.get('B')?.losses).toBe(1);
  });

  it('keeps the ratings zero-sum', () => {
    const ratings = computeElo([
      { a: 'A', b: 'B', result: 'a_win' },
      { a: 'B', b: 'C', result: 'draw' },
      { a: 'C', b: 'A', result: 'b_win' },
    ]);
    const total = [...ratings.values()].reduce((sum, r) => sum + r.elo, 0);
    expect(total).toBeCloseTo(3 * ELO_START, 6);
  });
});
