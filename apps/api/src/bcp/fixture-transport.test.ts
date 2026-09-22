import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../errors';
import { SAMPLE_FIXTURES_DIR } from '../test/helpers';
import { fixtureFileFor, FixtureTransport } from './fixture-transport';

describe('fixtureFileFor', () => {
  it.each([
    [{ path: '/v1/events', query: { limit: 100 } }, 'events/search.first.json'],
    [{ path: '/v1/events', query: { nextKey: 'ab/c=' } }, 'events/search.ab_c_.json'],
    [{ path: '/v2/events/E1' }, 'events/E1/event.json'],
    [{ path: '/v1/events/E1/players' }, 'events/E1/players.json'],
    [{ path: '/v1/events/E1/teamplayers' }, 'events/E1/teams.json'],
    [
      { path: '/v1/events/E1/pairings', query: { round: 2 } },
      'events/E1/team-pairings.round-2.json',
    ],
    [
      { path: '/v1/pairings', query: { eventId: 'E1', round: 1, nextKey: 'p2' } },
      'events/E1/pairings.round-1.p2.json',
    ],
    [{ path: '/v1/armylists/L1' }, 'armylists/L1.json'],
  ])('%j → %s', (request, file) => {
    expect(fixtureFileFor(request)).toBe(file);
  });

  it('rejects paths it has no mapping for', () => {
    expect(() => fixtureFileFor({ path: '/v1/unknown' })).toThrow(/No fixture mapping/);
  });
});

describe('FixtureTransport', () => {
  const transport = new FixtureTransport(SAMPLE_FIXTURES_DIR);

  it('reads the mapped JSON file', async () => {
    await expect(transport.get({ path: '/v1/armylists/LS-ADA' })).resolves.toMatchObject({
      id: 'LS-ADA',
    });
  });

  it('throws NotFoundError for missing files, like BCP answering 404', async () => {
    await expect(transport.get({ path: '/v1/armylists/NOPE' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
