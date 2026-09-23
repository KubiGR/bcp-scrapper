import { describe, expect, it } from 'vitest';
import { isEventStale, isLatestFresh } from './freshness';

const now = new Date('2026-09-23T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const window = { from: '2026-08-24', to: '2026-09-30' };

describe('isLatestFresh', () => {
  it('is fresh when one run covering the whole window finished under 6 hours ago', () => {
    expect(isLatestFresh(window, [{ ...window, finishedAt: hoursAgo(5) }], now)).toBe(true);
  });

  it('is stale when the covering run is 6+ hours old or does not cover the whole window', () => {
    expect(isLatestFresh(window, [{ ...window, finishedAt: hoursAgo(6) }], now)).toBe(false);
    expect(
      isLatestFresh(
        window,
        [{ from: '2026-08-25', to: '2026-09-30', finishedAt: hoursAgo(1) }],
        now,
      ),
    ).toBe(false);
    expect(isLatestFresh(window, [], now)).toBe(false);
  });
});

describe('isEventStale', () => {
  it('is stale when never synced', () => {
    expect(isEventStale({ ended: true, lastSyncedAt: null }, now)).toBe(true);
    expect(isEventStale({ ended: false, lastSyncedAt: null }, now)).toBe(true);
  });

  it('never goes stale once an ended event is synced (only an explicit Refresh reloads it)', () => {
    expect(isEventStale({ ended: true, lastSyncedAt: hoursAgo(24 * 30) }, now)).toBe(false);
  });

  it('goes stale 10 minutes after a running event was synced', () => {
    expect(
      isEventStale({ ended: false, lastSyncedAt: new Date(now.getTime() - 9 * 60_000) }, now),
    ).toBe(false);
    expect(
      isEventStale({ ended: false, lastSyncedAt: new Date(now.getTime() - 10 * 60_000) }, now),
    ).toBe(true);
  });
});
