import { describe, expect, it } from 'vitest';
import { capModifier, rollOdds, woundNeeded, type Classify } from './rolls';

/** 3+ to hit, 6s critical. */
const bs3: Classify = (face) => (face === 1 ? 0 : face === 6 ? 2 : face >= 3 ? 1 : 0);

describe('rollOdds', () => {
  it('without re-rolls', () => {
    const odds = rollOdds(bs3, 'none');
    expect(odds.success + odds.crit).toBeCloseTo(4 / 6);
    expect(odds.crit).toBeCloseTo(1 / 6);
    expect(odds.freeFail).toBeCloseTo(2 / 6);
  });

  it('re-rolling ones leaves other fails free for a later one-die re-roll', () => {
    const odds = rollOdds(bs3, 'ones');
    expect(odds.success + odds.crit).toBeCloseTo(4 / 6 + (1 / 6) * (4 / 6));
    expect(odds.freeFail).toBeCloseTo(1 / 6);
  });

  it('re-rolling failures, and fishing for criticals', () => {
    expect(rollOdds(bs3, 'failures').fail).toBeCloseTo((2 / 6) * (2 / 6));
    expect(rollOdds(bs3, 'fish').crit).toBeCloseTo(1 / 6 + (5 / 6) * (1 / 6));
  });
});

describe('woundNeeded', () => {
  it('compares Strength with Toughness', () => {
    expect(woundNeeded(8, 4)).toBe(2);
    expect(woundNeeded(5, 4)).toBe(3);
    expect(woundNeeded(4, 4)).toBe(4);
    expect(woundNeeded(4, 7)).toBe(5);
    expect(woundNeeded(4, 8)).toBe(6);
    expect(woundNeeded(3, 7)).toBe(6);
  });
});

describe('capModifier', () => {
  it('keeps hit and wound modifiers within ±1, or above 0 when penalties are ignored', () => {
    expect(capModifier(2, false)).toBe(1);
    expect(capModifier(-3, false)).toBe(-1);
    expect(capModifier(-1, true)).toBe(0);
  });
});
