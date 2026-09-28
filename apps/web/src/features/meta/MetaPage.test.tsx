import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { aPlayer } from '../../test/sample-data';
import { MetaPage } from './MetaPage';
import { metaResponse } from './meta-test-data';
import { metaParams } from './meta-queries';

describe('metaParams', () => {
  it('sends only the server filters', () => {
    expect(metaParams({ from: '2026-01-01', type: 'teams', sort: 'winRate', minPlayers: 3 })).toBe(
      'from=2026-01-01&type=teams',
    );
  });
});

describe('MetaPage', () => {
  it('shows the faction table, the unloaded-events notice and what top teams bring', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    renderWithRouter(<MetaPage search={{}} onSearchChange={vi.fn()} />);
    expect(await screen.findByText('Orks')).toBeInTheDocument();
    expect(screen.getByText(/2 big events in this range aren’t loaded yet/)).toBeInTheDocument();
    expect(screen.getByText('What top teams bring')).toBeInTheDocument();
    expect(screen.getByText('+3.0 pp')).toBeInTheDocument();
    expect(screen.getByText(/Based on 2 team events/)).toBeInTheDocument();
  });

  it('has no team section without team data', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse({ teams: null, teamEventsCounted: 0 }) });
    renderWithRouter(<MetaPage search={{}} onSearchChange={vi.fn()} />);
    await screen.findByText('Orks');
    expect(screen.queryByText('What top teams bring')).not.toBeInTheDocument();
  });

  it('says when there is nothing to show', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse({
        factions: [],
        teams: null,
        eventsInRange: 0,
        eventsLoaded: 0,
        totals: { players: 0, games: 0 },
      }),
    });
    renderWithRouter(<MetaPage search={{}} onSearchChange={vi.fn()} />);
    expect(await screen.findByText('No big events in this range.')).toBeInTheDocument();
  });

  it('sorts by win rate unless another column is chosen', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    renderWithRouter(<MetaPage search={{}} onSearchChange={vi.fn()} />);
    await screen.findByText('Orks');
    expect(screen.getByRole('columnheader', { name: 'Win rate' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('keeps sort and expanded factions in the search', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    const onSearchChange = vi.fn();
    renderWithRouter(<MetaPage search={{ type: 'teams' }} onSearchChange={onSearchChange} />);
    await screen.findByText('Orks');
    fireEvent.click(screen.getByRole('button', { name: 'Players' }));
    expect(onSearchChange).toHaveBeenCalledWith({ type: 'teams', sort: 'players', dir: 'desc' });
    fireEvent.click(screen.getByRole('button', { name: 'Show Orks detachments' }));
    expect(onSearchChange).toHaveBeenCalledWith({ type: 'teams', expanded: 'Orks' });
  });

  it('opens the players of a row, with their lists', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/meta': metaResponse(),
      'GET /api/players/search': {
        players: [
          {
            ...aPlayer({ name: 'Ada Archer', faction: 'Orks' }),
            eventId: 'EVT1',
            eventName: 'Sample Team Open',
            eventStartDate: '2026-03-28T09:00:00.000Z',
          },
        ],
        truncated: false,
        factionOptions: [],
        detachmentOptions: [],
        eventsInRange: 1,
        eventsLoaded: 1,
      },
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: null,
        faction: 'Orks',
        listId: 'LS-ADA',
        text: 'Orks list text',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    renderWithRouter(<MetaPage search={{}} onSearchChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '20 Orks players' }));
    expect(await screen.findByText('Ada Archer')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'W-L-D' })).toHaveAttribute(
      'aria-sort',
      'none',
    );
    fireEvent.click(screen.getByRole('button', { name: 'W-L-D' }));
    expect(screen.getByRole('columnheader', { name: /W-L-D/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    // Anywhere on the player's row opens the list.
    fireEvent.click(screen.getByText('Ada Archer'));
    expect(await screen.findByText('Orks list text')).toBeInTheDocument();
    const searchUrl = fetchMock.mock.calls
      .map(([input]) => (typeof input === 'string' ? input : ''))
      .find((url) => url.startsWith('/api/players/search'));
    expect(searchUrl).toContain('maxLosses=20');

    fireEvent.click(screen.getByRole('button', { name: 'Show Orks detachments' }));
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
  });

  it('shows the API error with a retry', async () => {
    stubFetchRoutes({
      'GET /api/meta': () =>
        Response.json(
          { error: { code: 'INTERNAL', message: 'Something went wrong' } },
          { status: 500 },
        ),
    });
    renderWithRouter(<MetaPage search={{}} onSearchChange={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('keeps Min players between 1 and 50', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    const onSearchChange = vi.fn();
    renderWithRouter(<MetaPage search={{}} onSearchChange={onSearchChange} />);
    await screen.findByText('Orks');
    fireEvent.change(screen.getByLabelText('Min players'), { target: { value: '0' } });
    expect(onSearchChange).not.toHaveBeenCalledWith({ minPlayers: 0 });
    fireEvent.change(screen.getByLabelText('Min players'), { target: { value: '12' } });
    expect(onSearchChange).toHaveBeenCalledWith({ minPlayers: 12 });
  });

  it('shows the new row’s players, not the previous row’s, while they load', async () => {
    const player = (name: string) => ({
      ...aPlayer({ name, faction: 'Orks' }),
      eventId: 'EVT1',
      eventName: 'Sample Team Open',
      eventStartDate: '2026-03-28T09:00:00.000Z',
    });
    stubFetchRoutes({
      'GET /api/meta': metaResponse(),
      'GET /api/players/search': (url: string) =>
        url.includes('factions=Orks')
          ? Response.json({
              players: [player('Ada Archer')],
              truncated: false,
              factionOptions: [],
              detachmentOptions: [],
              eventsInRange: 1,
              eventsLoaded: 1,
            })
          : new Promise<Response>(() => undefined), // Necrons never arrive
    });
    renderWithRouter(<MetaPage search={{}} onSearchChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '20 Orks players' }));
    expect(await screen.findByText('Ada Archer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '10 Necrons players' }));
    await screen.findByRole('heading', { name: 'Necrons' });
    expect(screen.queryByText('Ada Archer')).not.toBeInTheDocument();
  });
});
