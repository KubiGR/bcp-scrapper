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
      'GET /api/events/E1/teams/T1/pairings': { team, opponents: [opponent] },
    });
    renderWithRouter(
      <PairingsPage eventId="E1" teamId="T1" opponentId="T2" onOpponentChange={() => {}} />,
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
      'GET /api/events/E1/teams/T1/pairings': { team, opponents: [opponent] },
    });
    renderWithRouter(
      <PairingsPage eventId="E1" teamId="T1" opponentId="T2" onOpponentChange={() => {}} />,
    );
    expect(
      await screen.findByText('Dice Bunker has 4 players; pairings need 5 on each team.'),
    ).toBeInTheDocument();
  });

  it('asks for an opponent first', async () => {
    stubFetchRoutes({ 'GET /api/events/E1/teams/T1/pairings': { team, opponents: [opponent] } });
    renderWithRouter(
      <PairingsPage eventId="E1" teamId="T1" opponentId={null} onOpponentChange={() => {}} />,
    );
    expect(await screen.findByText('Pick the team you play this round.')).toBeInTheDocument();
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
      'GET /api/events/E1/teams/T1/pairings': { team, opponents: [opponent] },
    });
    renderWithRouter(
      <PairingsPage eventId="E1" teamId="T1" opponentId="T2" onOpponentChange={() => {}} />,
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
