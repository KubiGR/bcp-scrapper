import type { RoundsResponse } from '@bcp/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aPlayer } from '../../test/sample-data';
import { RoundsPanel } from './RoundsPanel';

const player = (id: string, name: string, faction: string) => ({
  id,
  name,
  faction,
  teamId: null,
  factionGuessed: false,
  detachments: [],
  disposition: null,
});
const rounds: RoundsResponse = {
  gamesAvailable: true,
  rounds: [
    {
      round: 1,
      bracket: false,
      matchups: [
        {
          id: 'M1',
          tableNo: 1,
          teamA: { id: 'RED', name: 'Red Legion' },
          teamB: { id: 'BLUE', name: 'Blue Wardens' },
          pointsA: 30,
          pointsB: 10,
          outcomeA: 'win',
          games: [
            {
              id: 'G1',
              tableNo: 1,
              playerA: player('R1', 'Rhea Stone', 'Adepta Sororitas'),
              playerB: player('B1', 'Bea Moss', 'Necrons'),
              gamePointsA: 20,
              gamePointsB: 0,
              vpA: null,
              vpB: null,
              firstTurn: null,
              result: 'a_win',
            },
          ],
        },
        {
          id: 'M2',
          tableNo: 2,
          teamA: { id: 'JADE', name: 'Jade Court' },
          teamB: null,
          pointsA: 40,
          pointsB: null,
          outcomeA: 'bye',
          games: [],
        },
      ],
      games: [],
    },
    { round: 2, bracket: true, matchups: [], games: [] },
  ],
};

describe('RoundsPanel', () => {
  it('lists a round’s matchups; expanding one shows its games with "–" for missing VP', async () => {
    stubFetchRoutes({ 'GET /api/events/EVT1/rounds': rounds });
    renderWithRouter(
      <RoundsPanel
        event={anEventDetail({
          pairings: {
            syncedAt: null,
            roundCount: 2,
            roundsDone: 2,
            queued: 0,
            queuedRounds: 0,
            failed: 0,
            failedRounds: [],
            loadFailed: false,
            gamesAvailable: true,
          },
        })}
      />,
    );
    const matchup = await screen.findByRole('button', {
      name: /Red Legion\s*30\s*–\s*10\s*Blue Wardens/,
    });
    expect(screen.getByText(/Jade Court/)).toBeInTheDocument();
    expect(screen.getByText('Bye')).toBeInTheDocument();
    fireEvent.click(matchup);
    expect(await screen.findByText('Rhea Stone')).toBeInTheDocument();
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(2); // VP A and B
    expect(screen.getByRole('radio', { name: 'Round 2 · Bracket' })).toBeInTheDocument();
    // Mantine's Accordion.Panel stays `display: none` until its collapse transition ends, which
    // jsdom never fires, so the link is present but not yet part of the accessibility tree —
    // find it by text (unaffected by visibility) and read the anchor itself.
    expect(screen.getByText('Red Legion · team page').closest('a')?.getAttribute('href')).toBe(
      '/events/EVT1/teams/RED',
    );
    expect(screen.getByText('Blue Wardens · team page').closest('a')?.getAttribute('href')).toBe(
      '/events/EVT1/teams/BLUE',
    );
  });

  it('shows a List button for a known player and opens the drawer; hides it for an unknown one', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/rounds': rounds,
      'GET /api/events/EVT1/players': {
        items: [aPlayer({ bcpId: 'R1', name: 'Rhea Stone', listStatus: 'fetched' })],
      },
      'GET /api/players/R1/list': {
        playerId: 'R1',
        playerName: 'Rhea Stone',
        teamName: 'Red Legion',
        faction: 'Adepta Sororitas',
        listId: 'LS-R1',
        text: 'Adepta Sororitas – list text',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    renderWithRouter(
      <RoundsPanel
        event={anEventDetail({
          pairings: {
            syncedAt: null,
            roundCount: 2,
            roundsDone: 2,
            queued: 0,
            queuedRounds: 0,
            failed: 0,
            failedRounds: [],
            loadFailed: false,
            gamesAvailable: true,
          },
        })}
      />,
    );
    const matchup = await screen.findByRole('button', {
      name: /Red Legion\s*30\s*–\s*10\s*Blue Wardens/,
    });
    fireEvent.click(matchup);
    const listButton = await screen.findByRole('button', { name: "Show Rhea Stone's list" });
    expect(screen.queryByRole('button', { name: "Show Bea Moss's list" })).not.toBeInTheDocument();
    fireEvent.click(listButton);
    expect(await screen.findByRole('dialog', { name: 'Rhea Stone' })).toBeInTheDocument();
    expect(await screen.findByText(/list text/)).toBeInTheDocument();
  });

  it('filters a round to the games of a player, army or team, opening their matchups', async () => {
    stubFetchRoutes({ 'GET /api/events/EVT1/rounds': rounds });
    renderWithRouter(<RoundsPanel event={anEventDetail()} />);
    const filter = await screen.findByRole('textbox', { name: 'Filter games' });
    fireEvent.change(filter, { target: { value: 'necrons' } });
    // Only the matching matchup, opened to its game.
    expect(screen.queryByText(/Jade Court/)).toBeNull();
    expect(screen.getByRole('button', { name: /Red Legion/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Bea Moss')).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: 'tyranids' } });
    expect(screen.getByText('No games match “tyranids” in this round.')).toBeInTheDocument();
  });
});
