import { describe, expect, it } from 'vitest';
import {
  FinderSearchSchema,
  finderWindow,
  SIZE_PRESETS,
  sizeBounds,
  toEventsQueryString,
  type FinderSearch,
} from './finder-search';

const now = new Date('2026-09-23T12:00:00Z');
const defaults = FinderSearchSchema.parse({});
const search = (changes: Partial<FinderSearch>): FinderSearch => ({ ...defaults, ...changes });

describe('FinderSearchSchema', () => {
  it('defaults to the latest view of 40+ player events, newest first', () => {
    expect(defaults).toEqual({ size: '40', type: 'all', sort: 'date', page: 1 });
  });

  it('falls back to defaults for garbage instead of failing', () => {
    expect(
      FinderSearchSchema.parse({
        size: 'huge',
        min: 'abc',
        from: 'yesterday',
        type: 'x',
        sort: 1,
        page: -3,
      }),
    ).toEqual({ size: '40', type: 'all', sort: 'date', page: 1 });
  });

  it('falls back to the default for the removed 16+ preset, e.g. from an old link', () => {
    expect(FinderSearchSchema.parse({ size: '16' })).toEqual({
      size: '40',
      type: 'all',
      sort: 'date',
      page: 1,
    });
  });
});

describe('SIZE_PRESETS', () => {
  it('has no 16+ preset: every stored event has 20+ players', () => {
    expect(SIZE_PRESETS.map((preset) => preset.value)).toEqual(['all', '40', '100', '200']);
  });

  it('labels "all" as "All (20+)", the smallest an event can be', () => {
    expect(SIZE_PRESETS.find((preset) => preset.value === 'all')?.label).toBe('All (20+)');
  });
});

describe('sizeBounds', () => {
  it('maps presets to a minimum player count', () => {
    expect(sizeBounds(search({ size: '100' }))).toEqual({ minPlayers: 100 });
    expect(sizeBounds(search({ size: 'all' }))).toEqual({ minPlayers: 0 });
  });

  it('uses the custom window, ignoring a maximum below the minimum', () => {
    expect(sizeBounds(search({ size: 'custom', min: 50, max: 120 }))).toEqual({
      minPlayers: 50,
      maxPlayers: 120,
    });
    expect(sizeBounds(search({ size: 'custom', min: 100, max: 40 }))).toEqual({ minPlayers: 100 });
  });
});

describe('finderWindow', () => {
  it('is the last 30 days in the latest view', () => {
    expect(finderWindow(defaults, now)).toEqual({ from: '2026-08-24', to: '2026-09-23' });
  });

  it('fills an open end and swaps a reversed range', () => {
    expect(finderWindow(search({ from: '2026-01-01' }), now)).toEqual({
      from: '2026-01-01',
      to: '2026-09-23',
    });
    expect(finderWindow(search({ from: '2026-05-01', to: '2026-02-01' }), now)).toEqual({
      from: '2026-02-01',
      to: '2026-05-01',
    });
  });
});

describe('toEventsQueryString', () => {
  it('builds the API query for the current search', () => {
    const query = new URLSearchParams(
      toEventsQueryString(search({ q: 'open', country: 'Germany', sort: 'players' }), now),
    );
    expect(Object.fromEntries(query)).toEqual({
      from: '2026-08-24',
      to: '2026-09-23',
      minPlayers: '40',
      type: 'all',
      sort: 'players',
      page: '1',
      pageSize: '25',
      q: 'open',
      country: 'Germany',
    });
  });
});
