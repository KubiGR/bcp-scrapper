import { describe, expect, it } from 'vitest';
import { qualifiesForMaxLosses } from './lists';

const record = (wins: number, losses: number, draws: number) => ({ wins, losses, draws });

describe('qualifiesForMaxLosses', () => {
  it('counts only losses: draws are not losses', () => {
    expect(qualifiesForMaxLosses(record(3, 1, 1), 1)).toBe(true);
    expect(qualifiesForMaxLosses(record(0, 0, 5), 0)).toBe(true);
    expect(qualifiesForMaxLosses(record(3, 2, 0), 1)).toBe(false);
  });

  it('includes the boundary', () => {
    expect(qualifiesForMaxLosses(record(3, 2, 0), 2)).toBe(true);
    expect(qualifiesForMaxLosses(record(5, 0, 0), 0)).toBe(true);
  });

  it('never selects a player without recorded games', () => {
    expect(qualifiesForMaxLosses(record(0, 0, 0), 5)).toBe(false);
  });
});
