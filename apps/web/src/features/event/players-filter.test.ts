import { describe, expect, it } from 'vitest';
import { aPlayer } from '../../test/sample-data';
import { factionsOf, filterPlayers, formatRecord } from './players-filter';

const players = [
  aPlayer(),
  aPlayer({ bcpId: 'PL-FINN', name: 'Finn Ford', teamName: 'Charlie Wing', faction: 'Orks' }),
  aPlayer({ bcpId: 'PL-SOLO', name: 'Solo', teamName: null, faction: null }),
];

describe('filterPlayers', () => {
  it('matches player or team names, ignoring case and surrounding spaces', () => {
    const names = (query: string) =>
      filterPlayers(players, { query, faction: null }).map((p) => p.name);
    expect(names('  ADA ')).toEqual(['Ada Archer']);
    expect(names('charlie')).toEqual(['Finn Ford']);
    expect(names('')).toHaveLength(3);
  });

  it('filters by faction, combined with the text', () => {
    expect(filterPlayers(players, { query: '', faction: 'Orks' }).map((p) => p.name)).toEqual([
      'Finn Ford',
    ]);
    expect(filterPlayers(players, { query: 'ada', faction: 'Orks' })).toEqual([]);
  });
});

describe('factionsOf / formatRecord', () => {
  it('lists distinct factions alphabetically and formats W-L-D', () => {
    expect(factionsOf(players)).toEqual(['Orks', 'Space Marines']);
    expect(formatRecord(aPlayer({ wins: 3, losses: 1, draws: 1 }))).toBe('3-1-1');
  });
});
