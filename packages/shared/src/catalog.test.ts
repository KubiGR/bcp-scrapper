import { describe, expect, it } from 'vitest';
import {
  addDays,
  BIG_EVENTS,
  daysIn,
  estimateCatalogRequests,
  findGaps,
  isBigEvent,
  latestWindow,
  mergeRanges,
  toIsoDate,
  type EventSizeRule,
} from './catalog';

describe('dates', () => {
  it('formats and shifts calendar days in UTC, across month ends', () => {
    expect(toIsoDate(new Date('2026-09-23T23:30:00Z'))).toBe('2026-09-23');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysIn({ from: '2026-09-01', to: '2026-09-01' })).toBe(1);
    expect(daysIn({ from: '2026-09-01', to: '2026-09-30' })).toBe(30);
  });

  it('builds the latest window: 30 days back, 7 ahead', () => {
    expect(latestWindow(new Date('2026-09-23T12:00:00Z'))).toEqual({
      from: '2026-08-24',
      to: '2026-09-30',
    });
  });
});

describe('mergeRanges', () => {
  it('merges overlapping and touching ranges, keeping the oldest sync time', () => {
    expect(
      mergeRanges([
        { from: '2026-09-10', to: '2026-09-20', syncedAt: '2026-09-22T10:00:00.000Z' },
        { from: '2026-09-01', to: '2026-09-09', syncedAt: '2026-09-23T10:00:00.000Z' },
        { from: '2026-09-15', to: '2026-09-25', syncedAt: '2026-09-21T10:00:00.000Z' },
        { from: '2026-10-05', to: '2026-10-06', syncedAt: '2026-09-23T10:00:00.000Z' },
      ]),
    ).toEqual([
      { from: '2026-09-01', to: '2026-09-25', syncedAt: '2026-09-21T10:00:00.000Z' },
      { from: '2026-10-05', to: '2026-10-06', syncedAt: '2026-09-23T10:00:00.000Z' },
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(mergeRanges([])).toEqual([]);
  });
});

describe('findGaps', () => {
  const window = { from: '2026-01-01', to: '2026-12-31' };

  it('is the whole window when nothing is covered', () => {
    expect(findGaps(window, [])).toEqual([window]);
  });

  it('returns only the uncovered parts of a partly fetched range', () => {
    expect(
      findGaps(window, [
        { from: '2025-12-01', to: '2026-01-31' },
        { from: '2026-03-01', to: '2026-03-31' },
        { from: '2026-12-01', to: '2027-01-31' },
      ]),
    ).toEqual([
      { from: '2026-02-01', to: '2026-02-28' },
      { from: '2026-04-01', to: '2026-11-30' },
    ]);
  });

  it('is empty when the window is fully covered', () => {
    expect(
      findGaps({ from: '2026-09-05', to: '2026-09-06' }, [
        { from: '2026-09-01', to: '2026-09-30' },
      ]),
    ).toEqual([]);
  });
});

describe('estimateCatalogRequests', () => {
  it('estimates about one request per two days, at least one', () => {
    expect(estimateCatalogRequests({ from: '2026-09-01', to: '2026-09-01' })).toBe(1);
    expect(estimateCatalogRequests({ from: '2026-01-01', to: '2026-12-31' })).toBe(183);
  });
});

describe('isBigEvent', () => {
  it('keeps events with at least the required rounds and players', () => {
    expect(isBigEvent({ roundCount: 4, playerCount: 20 }, BIG_EVENTS)).toBe(true);
  });

  it('drops an event with too few rounds despite many players', () => {
    expect(isBigEvent({ roundCount: 3, playerCount: 200 }, BIG_EVENTS)).toBe(false);
  });

  it('drops an event with too few players despite enough rounds', () => {
    expect(isBigEvent({ roundCount: 5, playerCount: 19 }, BIG_EVENTS)).toBe(false);
  });

  it('treats an unknown round count (0) as small', () => {
    expect(isBigEvent({ roundCount: 0, playerCount: 200 }, BIG_EVENTS)).toBe(false);
  });

  it('a rule of {0, 0} keeps everything', () => {
    const rule: EventSizeRule = { minRounds: 0, minPlayers: 0 };
    expect(isBigEvent({ roundCount: 0, playerCount: 0 }, rule)).toBe(true);
  });
});
