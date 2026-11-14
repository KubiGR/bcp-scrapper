import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { TeamPicker } from './TeamPicker';

const player = (
  bcpId: string,
  teamId: string,
  teamName: string,
  faction: string,
  fetched = true,
) => ({
  bcpId,
  name: `Player ${bcpId}`,
  bcpUserId: null,
  teamName,
  teamId,
  teamPlacing: null,
  teamRecord: null,
  faction,
  factionGuessed: false,
  parentFaction: null,
  placing: null,
  wins: 0,
  losses: 0,
  draws: 0,
  dropped: false,
  disposition: 'Take and Hold',
  detachments: [],
  listStatus: fetched ? 'fetched' : 'available',
  listError: null,
  listErrorCode: null,
});
const EVENTS = {
  items: [
    {
      bcpId: 'E1',
      name: 'Balkan Team Championship 2026',
      startDate: '2026-10-10T06:00:00.000Z',
      endDate: null,
      country: null,
      city: null,
      playerCount: 10,
      teamCount: 2,
      isTeamEvent: true,
      isOnline: false,
      roundCount: 5,
      ended: false,
      hideLists: false,
      lastSyncedAt: null,
      removedFromBcpAt: null,
      blockedAt: null,
      fieldElo: null,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 100,
};
const PLAYERS = {
  items: [
    ...[0, 1, 2, 3, 4].map((i) => player(`U${String(i)}`, 'T1', 'Dice Bunker', 'Space Marines')),
    ...[0, 1, 2, 3, 4].map((i) => player(`O${String(i)}`, 'T2', 'Mighty Ducks', 'Orks', i !== 4)),
  ],
};
const list = (playerId: string) => ({
  playerId,
  playerName: playerId,
  teamName: null,
  faction: 'Orks',
  listId: `L-${playerId}`,
  text: 'Warboss on Warbike (80 pts)\nWarbikers x6 (140 pts)',
  fetchedAt: '2026-10-01T00:00:00.000Z',
});

afterEach(() => {
  localStorage.clear();
});

/** Pick from a searchable dropdown: type part of the name, then click the option. */
async function choose(label: string, typed: string, option: RegExp) {
  const input = await screen.findByRole('combobox', { name: label });
  await vi.waitFor(() => {
    expect(input).toBeEnabled();
  });
  fireEvent.click(input);
  fireEvent.change(input, { target: { value: typed } });
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

describe('TeamPicker', () => {
  it('picks an event, our team and the opponent, then hands over both rosters with short lists', async () => {
    stubFetchRoutes({
      'GET /api/events/E1/players': PLAYERS,
      'GET /api/events?': EVENTS,
      'GET /api/players/': (url: string) => Response.json(list(url.split('/')[3] ?? '')),
    });
    const onUse = vi.fn();
    renderWithRouter(<TeamPicker onUse={onUse} />);
    await choose('Event', 'balkan', /^Balkan Team Championship/);
    await choose('Your team', 'dice', /^Dice Bunker/);
    await choose('Opponent', 'duck', /^Mighty Ducks/);
    // One opponent's list isn't fetched yet: it comes without a short list.
    expect(await screen.findByText(/9 of 10 lists fetched/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Use these teams' }));
    const plan = onUse.mock.calls[0]?.[0] as {
      theirs: { list: string | null }[];
      source: { event: string; team: string; opponent: string };
    };
    expect(plan.source).toMatchObject({ event: 'E1', team: 'T1', opponent: 'T2' });
    expect(plan.theirs[0]?.list).toBe('Warboss on Warbike\n6 Warbikers');
    expect(plan.theirs[4]?.list).toBeNull();
  });

  it('a team without exactly five players cannot be used', async () => {
    stubFetchRoutes({
      'GET /api/events/E1/players': { items: PLAYERS.items.slice(0, 9) },
      'GET /api/events?': EVENTS,
      'GET /api/players/': (url: string) => Response.json(list(url.split('/')[3] ?? '')),
    });
    renderWithRouter(<TeamPicker onUse={vi.fn()} />);
    await choose('Event', 'balkan', /^Balkan Team Championship/);
    await choose('Your team', 'dice', /^Dice Bunker/);
    await choose('Opponent', 'duck', /^Mighty Ducks/);
    expect(await screen.findByText(/Mighty Ducks has 4 players/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use these teams' })).toBeNull();
  });

  it('lists the events A–Z', async () => {
    stubFetchRoutes({
      'GET /api/events?': {
        ...EVENTS,
        items: [
          { ...EVENTS.items[0], bcpId: 'E2', name: 'Zagreb Team Open' },
          { ...EVENTS.items[0], bcpId: 'E3', name: 'Athens Team GT' },
          EVENTS.items[0],
        ],
      },
    });
    renderWithRouter(<TeamPicker onUse={vi.fn()} />);
    fireEvent.click(await screen.findByRole('combobox', { name: 'Event' }));
    const names = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(names.map((n) => n.split(' · ')[0])).toEqual([
      'Athens Team GT',
      'Balkan Team Championship 2026',
      'Zagreb Team Open',
    ]);
  });
});
