import type { PlayerRound, TeamDetailResponse } from '@bcp/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { TeamPage } from './TeamPage';

const round1: PlayerRound = {
  round: 1,
  opponent: { id: 'B1', name: 'Bea Moss', faction: 'Necrons', teamId: 'BLUE' },
  outcome: 'win',
  gamePoints: 20,
  opponentGamePoints: 0,
  vp: null,
  opponentVp: null,
};

const detail: TeamDetailResponse = {
  team: { id: 'RED', name: 'Red Legion', placing: 1 },
  rounds: [{ round: 1, bracket: false }],
  players: [
    {
      player: { id: 'R1', name: 'Rhea Stone', faction: 'Adepta Sororitas', teamId: 'RED' },
      perRound: [round1],
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
    expect(
      screen.queryByText((_, el) => el?.tagName === 'P' && el.textContent.startsWith('VP ')),
    ).not.toBeInTheDocument();
  });

  it('shows VP for a round when known', async () => {
    const withVp: TeamDetailResponse = {
      ...detail,
      players: [
        {
          player: { id: 'R1', name: 'Rhea Stone', faction: 'Adepta Sororitas', teamId: 'RED' },
          perRound: [{ ...round1, vp: 80, opponentVp: 60 }],
          totals: { wins: 1, losses: 0, draws: 0, points: 20 },
        },
      ],
    };
    stubFetchRoutes({
      'GET /api/events/EVT1/teams/RED': withVp,
      'GET /api/events/EVT1': anEventDetail(),
    });
    renderWithRouter(<TeamPage eventId="EVT1" teamId="RED" />);
    expect(await screen.findByRole('heading', { name: 'Red Legion' })).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'VP 80–60'),
    ).toBeInTheDocument();
  });

  it('invalidates the event’s queries once queued pairings settle to 0', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/teams/RED': detail,
      'GET /api/events/EVT1': anEventDetail({
        pairings: {
          syncedAt: null,
          roundCount: 2,
          roundsDone: 1,
          queued: 2,
          failed: 0,
          gamesAvailable: true,
        },
      }),
    });
    const { queryClient } = renderWithRouter(<TeamPage eventId="EVT1" teamId="RED" />);
    expect(await screen.findByRole('heading', { name: 'Red Legion' })).toBeInTheDocument();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      queryClient.setQueryData(
        ['event', 'EVT1'],
        anEventDetail({
          pairings: {
            syncedAt: null,
            roundCount: 2,
            roundsDone: 2,
            queued: 0,
            failed: 0,
            gamesAvailable: true,
          },
        }),
      );
    });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ queryKey: ['event', 'EVT1'] });
    });
  });
});
