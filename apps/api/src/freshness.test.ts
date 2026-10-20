import { describe, expect, it } from 'vitest';
import { isEventStale, isLatestFresh } from './freshness';

const now = new Date('2026-09-23T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const window = { from: '2026-08-24', to: '2026-09-30' };

describe('isLatestFresh', () => {
  it('is fresh when one run covering the whole window finished under 50 minutes ago', () => {
    expect(isLatestFresh(window, [{ ...window, finishedAt: hoursAgo(0.8) }], now)).toBe(true);
  });

  it('is stale when the covering run is 50+ minutes old or does not cover the whole window', () => {
    // Under the hourly refresh, so each hourly tick finds the last run stale and refreshes.
    expect(isLatestFresh(window, [{ ...window, finishedAt: hoursAgo(50 / 60) }], now)).toBe(false);
    expect(
      isLatestFresh(
        window,
        [{ from: '2026-08-25', to: '2026-09-30', finishedAt: hoursAgo(0.5) }],
        now,
      ),
    ).toBe(false);
    expect(isLatestFresh(window, [], now)).toBe(false);
  });
});

const running = { startDate: now, endDate: null, ended: false };
const finished = { startDate: hoursAgo(24 * 3), endDate: hoursAgo(24 * 2), ended: false };
const upcoming = { startDate: new Date(now.getTime() + 86_400_000), endDate: null, ended: false };

describe('isEventStale', () => {
  it('is stale when never synced', () => {
    expect(isEventStale({ ...finished, ended: true, lastSyncedAt: null }, now)).toBe(true);
    expect(isEventStale({ ...running, lastSyncedAt: null }, now)).toBe(true);
  });

  it('never goes stale once a finished event is synced after it ended (only Refresh reloads it)', () => {
    expect(isEventStale({ ...finished, ended: true, lastSyncedAt: hoursAgo(24) }, now)).toBe(false);
    // Not closed in BCP, but its last day is well past the grace period: still not auto-reloaded.
    expect(isEventStale({ ...finished, lastSyncedAt: hoursAgo(24) }, now)).toBe(false);
  });

  it('reloads a finished event once when it was last synced while it still ran', () => {
    // Synced during the last round: standings and records from mid-round, never final.
    expect(isEventStale({ ...finished, ended: true, lastSyncedAt: hoursAgo(49) }, now)).toBe(true);
    expect(isEventStale({ ...finished, lastSyncedAt: hoursAgo(49) }, now)).toBe(true);
  });

  it('never goes stale for an upcoming event, however old the sync', () => {
    expect(isEventStale({ ...upcoming, lastSyncedAt: hoursAgo(24 * 30) }, now)).toBe(false);
  });

  it('goes stale 10 minutes after a running event was synced', () => {
    expect(
      isEventStale({ ...running, lastSyncedAt: new Date(now.getTime() - 9 * 60_000) }, now),
    ).toBe(false);
    expect(
      isEventStale({ ...running, lastSyncedAt: new Date(now.getTime() - 10 * 60_000) }, now),
    ).toBe(true);
  });
});
