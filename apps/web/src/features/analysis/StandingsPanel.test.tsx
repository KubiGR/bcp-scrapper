import type { StandingsResponse } from '@bcp/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { StandingsPanel } from './StandingsPanel';

const standings: StandingsResponse = {
  rounds: [
    { round: 1, bracket: false },
    { round: 2, bracket: true },
  ],
  teams: [
    {
      team: { id: 'RED', name: 'Red Legion' },
      placing: 1,
      perRound: [
        { round: 1, points: 30, outcome: 'win', opponent: { id: 'BLUE', name: 'Blue Wardens' } },
        { round: 2, points: 40, outcome: 'bye', opponent: null },
      ],
      totals: { wins: 2, losses: 0, draws: 0, points: 70 },
    },
    {
      team: { id: 'GREY', name: 'Grey Watch' },
      placing: null,
      perRound: [
        { round: 1, points: 10, outcome: 'loss', opponent: { id: 'RED', name: 'Red Legion' } },
        null,
      ],
      totals: { wins: 0, losses: 1, draws: 0, points: 10 },
    },
  ],
};

describe('StandingsPanel', () => {
  it('shows teams with a cell per round, a bye, an empty round and links to each team', async () => {
    stubFetchRoutes({ 'GET /api/events/EVT1/standings': standings });
    renderWithRouter(
      <StandingsPanel
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
    const red = await screen.findByRole('link', { name: 'Red Legion' });
    expect(red.getAttribute('href')).toBe('/events/EVT1/teams/RED');
    expect(screen.getByRole('columnheader', { name: 'R2 · Bracket' })).toBeInTheDocument();
    expect(screen.getByText('Bye 40')).toBeInTheDocument();
    expect(screen.getByText('W 30')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2); // Grey Watch's placing and its empty round
    expect(screen.getByText('2-0-0')).toBeInTheDocument();
  });
});
