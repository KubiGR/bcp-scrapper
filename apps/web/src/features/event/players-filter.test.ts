import { describe, expect, it } from 'vitest';
import { aPlayer } from '../../test/sample-data';
import {
  dispositionsOf,
  factionsOf,
  filterPlayers,
  formatRecord,
  groupPlayersByTeam,
  lossOptions,
  missingListCount,
  type PlayerFilter,
} from './players-filter';

const players = [
  aPlayer(),
  aPlayer({ bcpId: 'PL-FINN', name: 'Finn Ford', teamName: 'Charlie Wing', faction: 'Orks' }),
  aPlayer({ bcpId: 'PL-SOLO', name: 'Solo', teamName: null, faction: null, disposition: null }),
];

describe('filterPlayers', () => {
  const none: PlayerFilter = { query: '', factions: [], dispositions: [], maxLosses: null };

  it('matches player or team names, ignoring case and surrounding spaces', () => {
    const names = (query: string) => filterPlayers(players, { ...none, query }).map((p) => p.name);
    expect(names('  ADA ')).toEqual(['Ada Archer']);
    expect(names('charlie')).toEqual(['Finn Ford']);
    expect(names('')).toHaveLength(3);
  });

  it('keeps players of any chosen faction, combined with the text', () => {
    expect(filterPlayers(players, { ...none, factions: ['Orks'] }).map((p) => p.name)).toEqual([
      'Finn Ford',
    ]);
    const ada = players[0]?.faction ?? '';
    expect(filterPlayers(players, { ...none, factions: ['Orks', ada] }).map((p) => p.name)).toEqual(
      ['Ada Archer', 'Finn Ford'],
    );
    expect(filterPlayers(players, { ...none, query: 'ada', factions: ['Orks'] })).toEqual([]);
  });

  it('keeps any chosen disposition, and ANDs it with the faction', () => {
    const withDispositions = [
      aPlayer({ bcpId: 'A', faction: 'Orks', disposition: 'Take and Hold' }),
      aPlayer({ bcpId: 'B', faction: 'Orks', disposition: 'Disruption' }),
      aPlayer({ bcpId: 'C', faction: 'Necrons', disposition: 'Disruption' }),
      aPlayer({ bcpId: 'D', faction: 'Orks', disposition: null }),
    ];
    const ids = (filter: Partial<PlayerFilter>) =>
      filterPlayers(withDispositions, { ...none, ...filter }).map((p) => p.bcpId);
    expect(ids({ dispositions: ['Disruption', 'Take and Hold'] })).toEqual(['A', 'B', 'C']);
    expect(ids({ factions: ['Orks'], dispositions: ['Disruption'] })).toEqual(['B']);
    expect(ids({})).toHaveLength(4);
  });
});

describe('factionsOf / formatRecord', () => {
  it('lists distinct factions alphabetically and formats W-L-D', () => {
    expect(factionsOf(players)).toEqual(['Orks', 'Space Marines']);
    expect(formatRecord(aPlayer({ wins: 3, losses: 1, draws: 1 }))).toBe('3-1-1');
  });
});

describe('dispositionsOf', () => {
  it('lists distinct dispositions alphabetically, leaving out null', () => {
    const withDispositions = [
      aPlayer({ bcpId: 'A', disposition: 'Take and Hold' }),
      aPlayer({ bcpId: 'B', disposition: 'Disruption' }),
      aPlayer({ bcpId: 'C', disposition: 'Take and Hold' }),
      aPlayer({ bcpId: 'D', disposition: null }),
    ];
    expect(dispositionsOf(withDispositions)).toEqual(['Disruption', 'Take and Hold']);
  });
});

describe('lossOptions', () => {
  it('offers X-0 up to X-(rounds-1), at most X-5', () => {
    expect(lossOptions(2)).toEqual([0, 1]);
    expect(lossOptions(5)).toEqual([0, 1, 2, 3, 4]);
    expect(lossOptions(9)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(lossOptions(1)).toEqual([0]);
    expect(lossOptions(0)).toEqual([]);
  });
});

describe('record filter and missing counts', () => {
  const list = [
    aPlayer({ bcpId: 'A', wins: 2, losses: 0, draws: 0, listStatus: 'available' }),
    aPlayer({ bcpId: 'B', wins: 1, losses: 1, draws: 0, listStatus: 'available' }),
    aPlayer({ bcpId: 'C', wins: 0, losses: 0, draws: 2, listStatus: 'fetched' }),
    aPlayer({ bcpId: 'D', wins: 0, losses: 0, draws: 0, listStatus: 'available' }),
  ];

  it('filters by loss limit (draws are not losses; no games never qualifies)', () => {
    expect(
      filterPlayers(list, { query: '', factions: [], dispositions: [], maxLosses: 0 }).map(
        (p) => p.bcpId,
      ),
    ).toEqual(['A', 'C']);
  });

  it('counts lists that could still be queued', () => {
    expect(missingListCount(list, null)).toBe(3);
    expect(missingListCount(list, 0)).toBe(1);
    expect(missingListCount(list, 1)).toBe(2);
  });

  it('does not count a list BCP says it does not have', () => {
    const withNoList = [
      ...list,
      aPlayer({
        bcpId: 'E',
        listStatus: 'failed',
        listError: 'No list on BCP',
        listErrorCode: 'NO_LIST',
      }),
      aPlayer({
        bcpId: 'F',
        listStatus: 'failed',
        listError: 'Down',
        listErrorCode: 'BCP_UNAVAILABLE',
      }),
    ];
    expect(missingListCount(withNoList, null)).toBe(4);
  });
});

describe('groupPlayersByTeam', () => {
  it('groups by team in placing order, with teamless players last', () => {
    const groups = groupPlayersByTeam([
      aPlayer({ bcpId: 'A', teamId: 'T2', teamName: 'Bravo', teamPlacing: 2 }),
      aPlayer({ bcpId: 'B', teamId: null, teamName: null, teamPlacing: null }),
      aPlayer({ bcpId: 'C', teamId: 'T1', teamName: 'Alpha', teamPlacing: 1 }),
      aPlayer({ bcpId: 'D', teamId: 'T2', teamName: 'Bravo', teamPlacing: 2 }),
      aPlayer({ bcpId: 'E', teamId: 'T3', teamName: 'Charlie', teamPlacing: null }),
    ]);
    expect(groups.map((g) => [g.teamName, g.players.map((p) => p.bcpId)])).toEqual([
      ['Alpha', ['C']],
      ['Bravo', ['A', 'D']],
      ['Charlie', ['E']],
      ['No team', ['B']],
    ]);
  });
});
