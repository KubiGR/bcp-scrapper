import type { PlayerRound, RoundsResponse, TeamDetailResponse } from '@bcp/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aPlayer } from '../../test/sample-data';
import { TeamPage } from './TeamPage';

const round1: PlayerRound = {
  round: 1,
  opponent: {
    id: 'B1',
    name: 'Bea Moss',
    faction: 'Necrons',
    teamId: 'BLUE',
    disposition: 'Reconnaissance',
  },
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
      player: {
        id: 'R1',
        name: 'Rhea Stone',
        faction: 'Adepta Sororitas',
        teamId: 'RED',
        disposition: 'Take and Hold',
      },
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
    // The player's own and the opponent's disposition badges.
    expect(screen.getByText('Take and Hold')).toBeInTheDocument();
    expect(screen.getByText('Reconnaissance')).toBeInTheDocument();
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
          player: {
            id: 'R1',
            name: 'Rhea Stone',
            faction: 'Adepta Sororitas',
            teamId: 'RED',
            disposition: 'Take and Hold',
          },
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

  it('shows the team’s matches from its point of view, in round order', async () => {
    const player = (id: string, name: string) => ({
      id,
      name,
      faction: null,
      teamId: null,
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
                  playerA: player('R1', 'Rhea Stone'),
                  playerB: player('B1', 'Bea Moss'),
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
              id: 'M-OTHER',
              tableNo: 2,
              teamA: { id: 'JADE', name: 'Jade Court' },
              teamB: { id: 'GOLD', name: 'Gold Watch' },
              pointsA: 20,
              pointsB: 20,
              outcomeA: 'draw',
              games: [],
            },
          ],
          games: [],
        },
        {
          round: 2,
          bracket: false,
          matchups: [
            {
              id: 'M2',
              tableNo: 1,
              teamA: { id: 'GREEN', name: 'Green Guard' },
              teamB: { id: 'RED', name: 'Red Legion' },
              pointsA: 15,
              pointsB: 25,
              outcomeA: 'loss',
              games: [],
            },
          ],
          games: [],
        },
        {
          round: 3,
          bracket: false,
          matchups: [
            {
              id: 'M3',
              tableNo: 3,
              teamA: { id: 'RED', name: 'Red Legion' },
              teamB: null,
              pointsA: 40,
              pointsB: null,
              outcomeA: 'bye',
              games: [],
            },
          ],
          games: [],
        },
      ],
    };
    stubFetchRoutes({
      'GET /api/events/EVT1/teams/RED': detail,
      'GET /api/events/EVT1/rounds': rounds,
      'GET /api/events/EVT1': anEventDetail(),
      'GET /api/events/EVT1/players': { items: [aPlayer({ bcpId: 'R1', name: 'Rhea Stone' })] },
    });
    renderWithRouter(<TeamPage eventId="EVT1" teamId="RED" />);
    expect(await screen.findByRole('heading', { name: 'Red Legion' })).toBeInTheDocument();

    const row1 = await screen.findByRole('button', {
      name: (_, el) => el.textContent === 'R1 · vs Blue Wardens · W 30–10',
    });
    const row2 = screen.getByRole('button', {
      name: (_, el) => el.textContent === 'R2 · vs Green Guard · W 25–15',
    });
    const row3 = screen.getByRole('button', {
      name: (_, el) => el.textContent === 'R3 · Bye · 40',
    });
    expect(row1.compareDocumentPosition(row2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row2.compareDocumentPosition(row3) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The matchup the team isn't in has no row.
    expect(screen.queryByText(/Jade Court/)).not.toBeInTheDocument();

    fireEvent.click(row1);
    // Appears once in the per-player table and once in the expanded matchup's games table.
    expect(await screen.findAllByText('Rhea Stone')).toHaveLength(2);
  });
});
