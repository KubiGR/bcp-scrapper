import { describe, expect, it } from 'vitest';
import { EventSearchSchema } from './event-search';

describe('EventSearchSchema', () => {
  it('keeps the open list, and falls back to the players tab', () => {
    expect(EventSearchSchema.parse({ tab: 'rounds', list: 'PL-ADA' })).toEqual({
      tab: 'rounds',
      list: 'PL-ADA',
    });
    expect(EventSearchSchema.parse({ tab: 'nope' })).toEqual({ tab: 'players' });
    expect(EventSearchSchema.parse({ list: 42 })).toEqual({ tab: 'players' });
  });

  it('accepts single or multiple choices and drops invalid filter values', () => {
    expect(
      EventSearchSchema.parse({
        q: 'Alex Smith',
        faction: ['Tyranids', 'Aeldari'],
        disposition: 'Take and Hold',
        detachment: 'Invasion Fleet',
        maxLosses: 0,
        sort: 'elo',
      }),
    ).toMatchObject({
      tab: 'players',
      q: 'Alex Smith',
      faction: ['Tyranids', 'Aeldari'],
      disposition: 'Take and Hold',
      detachment: 'Invasion Fleet',
      maxLosses: 0,
      sort: 'elo',
    });
    expect(EventSearchSchema.parse({ faction: 99, maxLosses: -4, sort: 'bogus' })).toEqual({
      tab: 'players',
      faction: undefined,
      maxLosses: undefined,
      sort: undefined,
    });
  });
});
