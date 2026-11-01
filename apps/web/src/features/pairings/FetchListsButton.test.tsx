import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { FetchListsButton } from './FetchListsButton';
import type { SheetPlan } from './sheet-plan';

const player = (bcpId: string, teamId: string, faction: string) => ({
  bcpId,
  name: `Player ${bcpId}`,
  bcpUserId: null,
  teamName: teamId,
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
  disposition: 'Disruption',
  detachments: ['Fresh Detachment'],
  listStatus: 'fetched',
  listError: null,
  listErrorCode: null,
});
const ids = [0, 1, 2, 3, 4];
const PLAYERS = {
  items: [
    ...ids.map((i) => player(`U${String(i)}`, 'T1', 'Space Marines')),
    ...ids.map((i) => player(`O${String(i)}`, 'T2', 'Orks')),
  ],
};
const roster = (prefix: string, faction: string) =>
  ids.map((i) => ({
    id: `${prefix}${String(i)}`,
    name: `Player ${prefix}${String(i)}`,
    faction,
    detachments: [],
    list: null,
  }));
const PLAN: SheetPlan = {
  ours: roster('U', 'Space Marines'),
  theirs: roster('O', 'Orks'),
  ratings: [{ playerId: 'U0', opponentPlayerId: 'O0', chip: 'GG' }],
  source: { event: 'E1', team: 'T1', opponent: 'T2', opponentName: 'Mighty Ducks' },
};

describe('FetchListsButton', () => {
  it('queues both teams’ lists, then refreshes the players and keeps the ratings', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/events/E1/lists/queue': {
        queued: 10,
        alreadyQueued: 0,
        alreadyFetched: 0,
        noListOnBcp: 0,
        notQualifying: 0,
        estimatedSeconds: 20,
      },
      'GET /api/events/E1/players': PLAYERS,
      'GET /api/players/': (url: string) =>
        Response.json({
          playerId: url.split('/')[3],
          playerName: 'x',
          teamName: null,
          faction: 'Orks',
          listId: 'L',
          text: 'Warbikers x6 (140 pts)',
          fetchedAt: '2026-10-01T00:00:00.000Z',
        }),
    });
    const onRefresh = vi.fn();
    renderWithProviders(<FetchListsButton plan={PLAN} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
    await vi.waitFor(() => {
      expect(onRefresh).toHaveBeenCalledOnce();
    });
    const queued = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(queued?.[1]?.body as string)).toEqual({ teamIds: ['T1', 'T2'] });
    const plan = onRefresh.mock.calls[0]?.[0] as SheetPlan;
    expect(plan.theirs[0]?.list).toBe('6 Warbikers');
    expect(plan.theirs[0]?.detachments).toEqual(['Fresh Detachment']);
    expect(plan.ratings).toEqual(PLAN.ratings);
    expect(plan.source).toEqual(PLAN.source);
  });
});
