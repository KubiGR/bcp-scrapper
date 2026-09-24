import type { TeamDetailResponse } from '@bcp/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { TeamPage } from './TeamPage';

const detail: TeamDetailResponse = {
  team: { id: 'RED', name: 'Red Legion', placing: 1 },
  rounds: [{ round: 1, bracket: false }],
  players: [
    {
      player: { id: 'R1', name: 'Rhea Stone', faction: 'Adepta Sororitas', teamId: 'RED' },
      perRound: [
        {
          round: 1,
          opponent: { id: 'B1', name: 'Bea Moss', faction: 'Necrons', teamId: 'BLUE' },
          outcome: 'win',
          gamePoints: 20,
          opponentGamePoints: 0,
          vp: null,
          opponentVp: null,
        },
      ],
      totals: { wins: 1, losses: 0, draws: 0, points: 20 },
    },
  ],
  totals: { wins: 1, losses: 0, draws: 0, points: 20 },
};

describe('TeamPage', () => {
  it('shows the team, its players and each round’s game', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/teams/RED': detail,
      'GET /api/events/EVT1': anEventDetail(),
    });
    renderWithRouter(<TeamPage eventId="EVT1" teamId="RED" />);
    expect(await screen.findByRole('heading', { name: 'Red Legion' })).toBeInTheDocument();
    expect(screen.getByText('Rhea Stone')).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'W 20–0'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bea Moss/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sample Team Open/ }).getAttribute('href')).toBe(
      '/events/EVT1?tab=standings',
    );
  });
});
