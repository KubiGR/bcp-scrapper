import { describe, expect, it } from 'vitest';
import { BcpSchemaError } from '../errors';
import {
  mapArmyList,
  mapEventDetail,
  mapEventSearchItem,
  mapPairing,
  mapPlayer,
  mapTeam,
  mapTeamPairing,
} from './mappers';
import {
  parseBcp,
  parseItems,
  RawArmyList,
  RawEventDetail,
  RawEventSearchItem,
  RawPairing,
  RawPlayer,
  RawTeam,
  RawTeamPairing,
  toNumberOrNull,
} from './raw';

describe('toNumberOrNull', () => {
  it.each([
    [42, 42],
    ['17', 17],
    ['', null],
    [null, null],
    [undefined, null],
    ['n/a', null],
    [true, null],
  ])('%j → %j', (input, expected) => {
    expect(toNumberOrNull(input)).toBe(expected);
  });
});

describe('parseBcp', () => {
  it('throws BcpSchemaError naming the endpoint and field path', () => {
    const attempt = () => parseBcp(RawPlayer, { id: 'P1', placing: 'first' }, '/v1/players');
    expect(attempt).toThrow(BcpSchemaError);
    try {
      attempt();
    } catch (error) {
      expect((error as BcpSchemaError).details).toMatchObject({
        endpoint: '/v1/players',
        issues: [{ path: 'placing' }],
      });
    }
  });

  it('parseItems keeps the untouched raw object next to the parsed one', () => {
    const raw = { id: 'L1', armyListText: 'x', somethingNew: true };
    expect(parseItems(RawArmyList, [raw], '/v1/armylists')).toEqual([
      { parsed: { id: 'L1', armyListText: 'x' }, raw },
    ]);
  });
});

describe('mapEventSearchItem', () => {
  it('defaults missing counts and flags and trims the name', () => {
    const raw = parseBcp(
      RawEventSearchItem,
      { id: 'E1', name: '  Tiny RTT ', eventDate: '2026-04-12T10:00:00.000Z', eventEndDate: null },
      'test',
    );
    expect(mapEventSearchItem(raw)).toEqual({
      bcpId: 'E1',
      name: 'Tiny RTT',
      startDate: '2026-04-12T10:00:00.000Z',
      endDate: null,
      country: null,
      city: null,
      playerCount: 0,
      teamCount: null,
      isTeamEvent: false,
      isOnline: false,
      roundCount: 0,
      ended: false,
      hideLists: false,
    });
  });
});

describe('mapEventDetail', () => {
  it('reads nested location, format, status and flags', () => {
    const raw = parseBcp(
      RawEventDetail,
      {
        id: 'E1',
        name: 'Open',
        dates: { start: '2026-03-28T09:00:00.000Z', end: '2026-03-29T18:00:00.000Z' },
        location: { city: 'Springfield', country: 'United States' },
        format: { teamEvent: true },
        status: { ended: true, numberOfRounds: 5 },
        playerCounts: { total: 432 },
        teamPlayerCounts: { total: 108 },
        flags: { hideLists: true },
        isOnlineEvent: false,
      },
      'test',
    );
    expect(mapEventDetail(raw)).toMatchObject({
      city: 'Springfield',
      country: 'United States',
      isTeamEvent: true,
      ended: true,
      roundCount: 5,
      playerCount: 432,
      teamCount: 108,
      hideLists: true,
    });
  });

  it('leaves teamCount null for singles events', () => {
    const raw = parseBcp(
      RawEventDetail,
      {
        id: 'E2',
        name: 'GT',
        dates: { start: '2026-03-28T09:00:00.000Z' },
        format: { teamEvent: false },
        teamPlayerCounts: { total: 0 },
      },
      'test',
    );
    expect(mapEventDetail(raw).teamCount).toBeNull();
  });
});

describe('mapPlayer', () => {
  it('builds the name, faction and win/loss/draw record', () => {
    const raw = parseBcp(
      RawPlayer,
      {
        id: 'P1',
        user: { firstName: 'Ada', lastName: 'Archer' },
        teamPlayerId: 'T1',
        faction: { name: 'Blood Angels', parentFaction: { name: 'Space Marines' } },
        placing: 3,
        dropped: false,
        listId: 'L1',
        total_games: [
          { gameNum: 1, gameResult: 2, gamePoints: 15 },
          { gameNum: 2, gameResult: 1, gamePoints: 10 },
          { gameNum: 3, gameResult: 0, gamePoints: 4 },
          { gameNum: 4, gameResult: 2, gamePoints: 20 },
        ],
      },
      'test',
    );
    expect(mapPlayer(raw, 'E1')).toEqual({
      bcpId: 'P1',
      eventBcpId: 'E1',
      teamBcpId: 'T1',
      name: 'Ada Archer',
      faction: 'Blood Angels',
      parentFaction: 'Space Marines',
      placing: 3,
      wins: 2,
      losses: 1,
      draws: 1,
      dropped: false,
      listBcpId: 'L1',
    });
  });

  it('falls back to "Unknown player" when BCP hides the user', () => {
    const raw = parseBcp(RawPlayer, { id: 'P2', user: null }, 'test');
    expect(mapPlayer(raw, 'E1')).toMatchObject({ name: 'Unknown player', teamBcpId: null });
  });
});

describe('mapTeam', () => {
  it('orders round points by game number', () => {
    const raw = parseBcp(
      RawTeam,
      {
        id: 'T1',
        name: 'Alpha ',
        placing: 1,
        total_games: [
          { gameNum: 2, gameResult: 2, gamePoints: '24' },
          { gameNum: 1, gameResult: 2, gamePoints: 25 },
        ],
      },
      'test',
    );
    expect(mapTeam(raw, 'E1')).toEqual({
      bcpId: 'T1',
      eventBcpId: 'E1',
      name: 'Alpha',
      placing: 1,
      roundPoints: [25, 24],
    });
  });
});

describe('mapTeamPairing', () => {
  it('maps both teams and their points', () => {
    const raw = parseBcp(
      RawTeamPairing,
      {
        id: 'TP1',
        round: 1,
        table: 3,
        teamPlayer1: { id: 'T1', name: 'A' },
        teamPlayer2: { id: 'T2', name: 'B' },
        player1Game: { result: 2, points: 17 },
        player2Game: { result: 0, points: 3 },
      },
      'test',
    );
    expect(mapTeamPairing(raw, 'E1')).toEqual({
      bcpId: 'TP1',
      eventBcpId: 'E1',
      round: 1,
      tableNo: 3,
      teamABcpId: 'T1',
      teamBBcpId: 'T2',
      pointsA: 17,
      pointsB: 3,
    });
  });

  it('returns null when the first team is missing', () => {
    const raw = parseBcp(RawTeamPairing, { id: 'TP1', round: 1, teamPlayer1: null }, 'test');
    expect(mapTeamPairing(raw, 'E1')).toBeNull();
  });
});

describe('mapPairing', () => {
  const pairing = (
    metaData: Record<string, unknown>,
    player2: { id: string } | null = { id: 'P2' },
  ) =>
    parseBcp(
      RawPairing,
      {
        id: 'G1',
        round: 2,
        table: 7,
        teamPairingId: 'TP1',
        player1: { id: 'P1' },
        player2,
        metaData,
      },
      'test',
    );

  it('reads scores from metaData, including numeric strings', () => {
    const game = mapPairing(
      pairing({
        'p1-firstTurn': true,
        'p2-firstTurn': '',
        'p1-primary': '45',
        'p2-primary': '30',
        'p1-secondary': '35',
        'p2-secondary': '30',
        'p1-victoryPoints': 80,
        'p2-victoryPoints': 60,
        'p1-gamePoints': '15',
        'p2-gamePoints': '5',
        'p1-gameResult': '2',
        'p2-gameResult': '0',
      }),
      'E1',
    );
    expect(game).toEqual({
      bcpId: 'G1',
      eventBcpId: 'E1',
      round: 2,
      tableNo: 7,
      teamMatchupBcpId: 'TP1',
      playerABcpId: 'P1',
      playerBBcpId: 'P2',
      vpA: 80,
      vpB: 60,
      primaryA: 45,
      primaryB: 30,
      secondaryA: 35,
      secondaryB: 30,
      gamePointsA: 15,
      gamePointsB: 5,
      firstTurn: 'a',
      result: 'a_win',
    });
  });

  it('recognises draws, player-2 first turns and unplayed games', () => {
    expect(
      mapPairing(
        pairing({ 'p2-firstTurn': true, 'p1-gameResult': '1', 'p2-gameResult': '1' }),
        'E1',
      ),
    ).toMatchObject({ firstTurn: 'b', result: 'draw' });
    expect(mapPairing(pairing({}), 'E1')).toMatchObject({
      firstTurn: null,
      result: null,
      vpA: null,
    });
  });

  it('maps a bye (no player 2)', () => {
    expect(mapPairing(pairing({ 'p1-gameResult': 2 }, null), 'E1')).toMatchObject({
      playerBBcpId: null,
      result: 'a_win',
    });
  });
});

describe('mapArmyList', () => {
  it('treats blank text as no list', () => {
    expect(mapArmyList(parseBcp(RawArmyList, { id: 'L1', armyListText: '  ' }, 't'))).toEqual({
      bcpId: 'L1',
      text: null,
    });
    expect(mapArmyList(parseBcp(RawArmyList, { id: 'L2', armyListText: ' Orks\n' }, 't'))).toEqual({
      bcpId: 'L2',
      text: 'Orks',
    });
  });
});
