import type { RoundsResponse } from '@bcp/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { RoundsPanel } from './RoundsPanel';

const player = (id: string, name: string, faction: string) => ({ id, name, faction, teamId: null });
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
            failed: 0,
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
});
