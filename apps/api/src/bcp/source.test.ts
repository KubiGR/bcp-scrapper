import { describe, expect, it } from 'vitest';
import { BcpUnavailableError } from '../errors';
import { sampleSource } from '../test/helpers';
import { BcpSource } from './source';
import type { BcpRequest, BcpTransport } from './transport';

const EVENT = 'EVTTEAM0001';
const source = sampleSource();

describe('BcpSource over the sample fixtures', () => {
  it('pages through event search results', async () => {
    const first = await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, null);
    expect(first.items.map((e) => e.bcpId)).toEqual(['EVTSINGLE01', 'EVTTEAM0001']);
    expect(first.nextCursor).toBe('page-2');

    const second = await source.listEvents({ from: '2026-01-01', to: '2026-12-31' }, 'page-2');
    expect(second.items.map((e) => e.name)).toEqual(['Tiny RTT']);
    expect(second.nextCursor).toBeNull();
  });

  it('keeps the original JSON alongside mapped values', async () => {
    const event = await source.getEvent(EVENT);
    expect(event).toMatchObject({
      bcpId: EVENT,
      city: 'Springfield',
      roundCount: 2,
      isTeamEvent: true,
      teamCount: 4,
    });
    expect(event.raw).toMatchObject({ format: { pairingStyle: 'swiss' } });
  });

  it('loads teams and players', async () => {
    const teams = await source.getTeams(EVENT);
    expect(teams.map((t) => [t.name, t.roundPoints])).toContainEqual(['Charlie Wing', [24, 24]]);

    const players = await source.getPlayers(EVENT);
    expect(players).toHaveLength(8);
    expect(players.find((p) => p.bcpId === 'PL-DAN')).toMatchObject({
      name: 'Dan Drake',
      teamBcpId: 'TM-BRAVO',
      draws: 2,
    });
  });

  it('loads team matchups and all pages of games for a round', async () => {
    const matchups = await source.getTeamMatchups(EVENT, 1);
    expect(matchups.map((m) => [m.teamABcpId, m.pointsA, m.teamBBcpId, m.pointsB])).toEqual([
      ['TM-ALPHA', 25, 'TM-BRAVO', 15],
      ['TM-CHARLIE', 24, 'TM-DELTA', 16],
    ]);

    const games = await source.getGames(EVENT, 1);
    expect(games.map((g) => g.bcpId)).toEqual(['GM-R1-1', 'GM-R1-2', 'GM-R1-3', 'GM-R1-4']);
  });

  it('returns null for a list BCP does not have', async () => {
    await expect(source.getList('LS-ADA')).resolves.toMatchObject({
      text: expect.stringContaining('Gladius'),
    });
    await expect(source.getList('LS-MISSING')).resolves.toBeNull();
  });
});

/** Answers every request with one game and the same nextKey, recording what was asked. */
function repeatingCursorTransport(): BcpTransport & { requests: BcpRequest[] } {
  const requests: BcpRequest[] = [];
  return {
    requests,
    get(request) {
      requests.push(request);
      const game = { id: `G${requests.length}`, round: 1, player1: null, player2: null };
      return Promise.resolve({ data: [game], nextKey: 'same-page' });
    },
  };
}

describe('BcpSource.getGames paging', () => {
  it('asks for 500 games per page', async () => {
    const transport = repeatingCursorTransport();
    await new BcpSource(transport).getGames(EVENT, 1).catch(() => undefined);
    expect(transport.requests[0]?.query).toMatchObject({ limit: 500, round: 1 });
  });

  it('stops with BcpUnavailableError when BCP repeats a page cursor', async () => {
    const transport = repeatingCursorTransport();
    await expect(new BcpSource(transport).getGames(EVENT, 1)).rejects.toThrow(
      new BcpUnavailableError('BCP returned a repeated page cursor for /v1/pairings'),
    );
    expect(transport.requests).toHaveLength(2);
  });
});
