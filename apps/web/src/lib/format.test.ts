import { describe, expect, it } from 'vitest';
import { formatEventDates, formatEventSize, formatRoundCount, ordinal } from './format';

const utcDay = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

describe('formatEventDates', () => {
  it('shows calendar days in UTC, so an evening start never shifts a day', () => {
    expect(formatEventDates('2026-08-08T23:30:00.000Z', null)).toBe(
      utcDay.format(new Date('2026-08-08T12:00:00Z')),
    );
  });

  it('shows a range for multi-day events', () => {
    expect(formatEventDates('2026-08-08T08:00:00.000Z', '2026-08-09T18:00:00.000Z')).toBe(
      utcDay.formatRange(new Date('2026-08-08T00:00:00Z'), new Date('2026-08-09T00:00:00Z')),
    );
  });
});

describe('formatEventSize', () => {
  it('adds the team count when known', () => {
    expect(formatEventSize({ playerCount: 432, teamCount: 108 })).toBe('432 players · 108 teams');
    expect(formatEventSize({ playerCount: 64, teamCount: null })).toBe('64 players');
    expect(formatEventSize({ playerCount: 1, teamCount: null })).toBe('1 player');
  });
});

describe('formatRoundCount', () => {
  it('pluralises, singularises for one, and is null for an unknown round count', () => {
    expect(formatRoundCount(5)).toBe('5 rounds');
    expect(formatRoundCount(1)).toBe('1 round');
    expect(formatRoundCount(0)).toBeNull();
  });
});

describe('ordinal', () => {
  it('adds st, nd, rd or th', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 112].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '112th',
    ]);
  });
});
