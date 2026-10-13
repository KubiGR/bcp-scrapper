import { describe, expect, it } from 'vitest';
import { lastSeen } from './last-seen';

const now = new Date('2026-10-14T12:00:00Z');
const before = (ms: number) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('lastSeen', () => {
  it('says never for someone not seen yet', () => {
    expect(lastSeen(null, now)).toBe('Never');
  });

  it('says how long ago, in the largest whole unit', () => {
    expect(lastSeen(before(30_000), now)).toBe('Just now');
    expect(lastSeen(before(5 * MIN), now)).toBe('5 min ago');
    expect(lastSeen(before(3 * HOUR + 20 * MIN), now)).toBe('3 h ago');
    expect(lastSeen(before(DAY + HOUR), now)).toBe('Yesterday');
    expect(lastSeen(before(4 * DAY), now)).toBe('4 days ago');
  });

  it('gives the date past a month', () => {
    expect(lastSeen('2026-08-03T09:00:00Z', now)).toBe('3 Aug 2026');
  });
});
