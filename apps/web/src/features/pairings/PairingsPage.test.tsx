import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { PairingsPage } from './PairingsPage';
import { pairingQuery } from './pairing-queries';

const team = { id: 'T1', name: 'Dice Bunker' };
const opponent = { id: 'T2', name: 'Mighty Ducks' };
const roster = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    name: `${prefix}${i}`,
    faction: 'Orks',
    detachments: [],
    list: null,
  }));

const LISTS = {
  'GET /api/events/E1/pairings': { teams: [team, opponent] },
  'GET /api/events?': {
    items: [
      {
        bcpId: 'E1',
        name: 'Balkan Team Championship 2026',
        startDate: '2026-10-10T06:00:00.000Z',
        endDate: null,
        country: 'Greece',
        city: null,
        playerCount: 101,
        teamCount: 21,
        isTeamEvent: true,
        isOnline: false,
        roundCount: 5,
        ended: false,
        hideLists: false,
        lastSyncedAt: null,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 100,
  },
};

// The stub matches by prefix: the opponent's address is listed before the shorter teams address.
describe('PairingsPage', () => {
  it('shows how many games are rated', async () => {
    stubFetchRoutes({
      'GET /api/events/E1/teams/T1/pairings/T2': {
        team,
        opponent,
        ours: roster('U', 5),
        theirs: roster('H', 5),
        problem: null,
        ratings: [{ playerId: 'U0', opponentPlayerId: 'H0', chip: 'G' }],
      },
      ...LISTS,
    });
    renderWithRouter(
      <PairingsPage choice={{ event: 'E1', team: 'T1', opponent: 'T2' }} onChange={() => {}} />,
    );
    expect(await screen.findByText(/^1 of 25 rated/)).toBeInTheDocument();
  });

  it('shows the problem instead of analysing', async () => {
    stubFetchRoutes({
      'GET /api/events/E1/teams/T1/pairings/T2': {
        team,
        opponent,
        ours: roster('U', 4),
        theirs: roster('H', 5),
        ratings: [],
        problem: 'Dice Bunker has 4 players; pairings need 5 on each team.',
      },
      ...LISTS,
    });
    renderWithRouter(
      <PairingsPage choice={{ event: 'E1', team: 'T1', opponent: 'T2' }} onChange={() => {}} />,
    );
    expect(
      await screen.findByText('Dice Bunker has 4 players; pairings need 5 on each team.'),
    ).toBeInTheDocument();
  });

  it('asks for the event, your team and the opponent', async () => {
    stubFetchRoutes(LISTS);
    renderWithRouter(<PairingsPage choice={{}} onChange={() => {}} />);
    expect(
      await screen.findByText('Pick the event, your team and the team you play.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'My team' })).toBeDisabled();
  });

  it('choosing an event starts the team and opponent over', async () => {
    stubFetchRoutes(LISTS);
    const onChange = vi.fn();
    renderWithRouter(
      <PairingsPage choice={{ event: 'E0', team: 'X', opponent: 'Y' }} onChange={onChange} />,
    );
    fireEvent.click(await screen.findByRole('combobox', { name: 'Event' }));
    fireEvent.click(await screen.findByRole('option', { name: /Balkan Team Championship/ }));
    expect(onChange).toHaveBeenCalledWith({ event: 'E1' });
  });

  it('the opponent list leaves out your own team, and picking one keeps the rest', async () => {
    stubFetchRoutes(LISTS);
    const onChange = vi.fn();
    renderWithRouter(<PairingsPage choice={{ event: 'E1', team: 'T1' }} onChange={onChange} />);
    const input = await screen.findByRole('combobox', { name: 'Opponent' });
    await vi.waitFor(() => {
      expect(input).toBeEnabled();
    });
    fireEvent.click(input);
    expect(screen.queryByRole('option', { name: 'Dice Bunker' })).toBeNull();
    fireEvent.click(await screen.findByRole('option', { name: 'Mighty Ducks' }));
    expect(onChange).toHaveBeenCalledWith({ event: 'E1', team: 'T1', opponent: 'T2' });
  });

  it('refetches every 10 seconds so teammates’ edits appear', () => {
    expect(pairingQuery('E1', 'T1', 'T2').refetchInterval).toBe(10_000);
  });

  it('a pasted sheet is saved in one request', async () => {
    const fetchMock = stubFetchRoutes({
      'PUT /api/events/E1/teams/T1/pairings/T2': { saved: 25 },
      'GET /api/events/E1/teams/T1/pairings/T2': {
        team,
        opponent,
        ours: roster('U', 5),
        theirs: roster('H', 5),
        problem: null,
        ratings: [],
      },
      ...LISTS,
    });
    renderWithRouter(
      <PairingsPage choice={{ event: 'E1', team: 'T1', opponent: 'T2' }} onChange={() => {}} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Paste from sheet' }));
    const sheet = Array.from({ length: 5 }, () => 'G\tG\tG\tG\tG').join('\n');
    fireEvent.change(screen.getByLabelText('Copied cells'), { target: { value: sheet } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 25 games' }));
    await vi.waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(put?.[0]).toBe('/api/events/E1/teams/T1/pairings/T2');
      const body = JSON.parse(put?.[1]?.body as string) as { ratings: unknown[] };
      expect(body.ratings).toHaveLength(25);
    });
  });
});
