import type { RankedPlayerRow, RankingsResponse } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { PlayersPage } from './PlayersPage';

const player = (overrides: Partial<RankedPlayerRow> = {}): RankedPlayerRow => ({
  rank: 1,
  userId: 'US-ADA',
  name: 'Ada Archer',
  points: 412.34,
  counted: 5,
  results: 8,
  best: {
    eventId: 'E1',
    eventName: 'London GT',
    eventStart: '2026-09-01',
    isTeamEvent: false,
    teamName: null,
    placing: 1,
    field: 96,
    score: 98,
    counts: true,
  },
  factions: ['Orks', 'Necrons'],
  ...overrides,
});

const response = (
  players: RankedPlayerRow[],
  overrides: Partial<RankingsResponse> = {},
): RankingsResponse => ({
  players,
  total: players.length,
  ranked: players.length,
  factionOptions: ['Necrons', 'Orks'],
  ...overrides,
});

describe('PlayersPage', () => {
  it('ranks players with points, events, best result and factions', async () => {
    stubFetchRoutes({
      'GET /api/rankings': response([
        player(),
        player({
          rank: 2,
          userId: 'US-BEN',
          name: 'Ben Brass',
          best: { ...player().best, isTeamEvent: true, placing: 2, field: 20 },
        }),
      ]),
    });
    renderWithRouter(<PlayersPage search={{}} onSearchChange={vi.fn()} />);
    const table = within(await screen.findByRole('table', { name: 'Players' }));
    const [ada, ben] = table.getAllByRole('row').slice(1);
    if (ada === undefined || ben === undefined) throw new Error('missing rows');
    const row = within(ada);
    expect(row.getByRole('link', { name: 'Ada Archer' })).toHaveAttribute(
      'href',
      '/players/US-ADA',
    );
    expect(row.getByText('412.3')).toBeInTheDocument();
    expect(row.getByText('5 of 8')).toBeInTheDocument();
    expect(row.getByText('1st of 96 · London GT')).toBeInTheDocument();
    expect(row.getByText('Orks, Necrons')).toBeInTheDocument();
    expect(within(ben).getByText('2nd of 20 teams · London GT')).toBeInTheDocument();
  });

  it('keeps the name search in the address', async () => {
    stubFetchRoutes({ 'GET /api/rankings': response([player()]) });
    const onSearchChange = vi.fn();
    renderWithRouter(<PlayersPage search={{}} onSearchChange={onSearchChange} />);
    await screen.findByRole('table', { name: 'Players' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search players' }), {
      target: { value: 'ada' },
    });
    expect(onSearchChange).toHaveBeenCalledWith({ q: 'ada' });
  });

  it('shows the next 100 players on request, past 500 too, keeping the ones shown', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/rankings': (url: string) =>
        Response.json(
          url.includes('offset=500')
            ? response([player({ rank: 501, userId: 'US-NEW', name: 'Nia New' })], { total: 900 })
            : response([player()], { total: 900 }),
        ),
    });
    renderWithRouter(<PlayersPage search={{}} onSearchChange={vi.fn()} />);
    await screen.findByRole('table', { name: 'Players' });
    // Each click asks for the next page only, so it never runs into the API's page size cap.
    for (let page = 1; page <= 5; page += 1) {
      fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
      await waitFor(() => {
        expect(JSON.stringify(fetchMock.mock.calls)).toContain(`offset=${String(page * 100)}`);
      });
    }
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('limit=600');
    expect(await screen.findByRole('link', { name: 'Nia New' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ada Archer' }).length).toBeGreaterThan(0);
  });

  it('says when nobody is ranked yet', async () => {
    stubFetchRoutes({ 'GET /api/rankings': response([], { factionOptions: [] }) });
    renderWithRouter(<PlayersPage search={{}} onSearchChange={vi.fn()} />);
    expect(
      await screen.findByText(
        'No ranked players yet: rankings need finished big events of the last 12 months.',
      ),
    ).toBeInTheDocument();
  });
});
