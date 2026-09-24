import { describe, expect, it } from 'vitest';
import { formatPoints, formatTotals, outcomeLabel } from './format';

describe('analysis format', () => {
  it('shows missing points as a dash, never 0', () => {
    expect(formatPoints(null)).toBe('–');
    expect(formatPoints(0)).toBe('0');
  });
  it('labels outcomes and totals', () => {
    expect(['win', 'loss', 'draw', 'bye', null].map((o) => outcomeLabel(o as never))).toEqual([
      'W',
      'L',
      'D',
      'Bye',
      '–',
    ]);
    expect(formatTotals({ wins: 3, losses: 0, draws: 1, points: 70 })).toBe('3-0-1');
  });
});
