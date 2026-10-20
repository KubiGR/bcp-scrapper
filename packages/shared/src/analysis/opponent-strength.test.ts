import { describe, expect, it } from 'vitest';
import { opponentStrengths } from './opponent-strength';

const records = new Map([
  ['A', { wins: 3, losses: 0, draws: 0 }],
  ['B', { wins: 2, losses: 1, draws: 0 }],
  ['C', { wins: 1, losses: 1, draws: 1 }],
  ['D', { wins: 0, losses: 3, draws: 0 }],
]);

describe('opponentStrengths', () => {
  it('averages the event records and wh40k-elo of the opponents each player met', () => {
    const strengths = opponentStrengths(
      [
        { a: 'A', b: 'D' },
        { a: 'A', b: 'C' },
        { a: 'B', b: 'A' },
        { a: 'B', b: null }, // a bye: no opponent
      ],
      records,
      new Map([
        ['D', 1500],
        ['C', 1700],
      ]),
    );
    // A met D (0/3), C (1.5/3) and B (2/3).
    expect(strengths.get('A')?.winRate).toBeCloseTo((0 + 0.5 + 2 / 3) / 3);
    // Only D and C are rated.
    expect(strengths.get('A')?.elo).toBe(1600);
    expect(strengths.get('A')?.rated).toBe(2);
    expect(strengths.get('A')?.games).toBe(3);
    expect(strengths.get('B')).toEqual({ winRate: 1, elo: null, rated: 0, games: 1 });
    expect(strengths.get('D')?.winRate).toBe(1);
  });

  it('leaves out an opponent without any recorded game', () => {
    const strengths = opponentStrengths(
      [{ a: 'A', b: 'E' }],
      new Map([...records, ['E', { wins: 0, losses: 0, draws: 0 }]]),
      new Map(),
    );
    expect(strengths.get('A')).toEqual({ winRate: null, elo: null, rated: 0, games: 1 });
  });
});
