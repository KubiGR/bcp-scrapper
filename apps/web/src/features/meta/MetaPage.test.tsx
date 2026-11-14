import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { aPlayer } from '../../test/sample-data';
import { MetaPage } from './MetaPage';
import { metaResponse } from './meta-test-data';
import { metaParams, reliableTone, winRateTone } from './meta-queries';

describe('metaParams', () => {
  it('sends only the server filters', () => {
    expect(metaParams({ from: '2026-01-01', type: 'teams', sort: 'winRate', minPlayers: 3 })).toBe(
      'from=2026-01-01&type=teams',
    );
  });
});

describe('MetaPage', () => {
  it('compares the latest update in range with the one before it for Change', async () => {
    const update = (id: string, start: string, name: string) => ({
      id,
      name,
      autoName: name,
      start,
      autoStart: start,
      merged: false,
      hidden: false,
      events: 4,
      summary: '',
      added: false,
      suggestions: [name],
    });
    const fetchMock = stubFetchRoutes({
      'GET /api/meta': metaResponse(),
      'GET /api/updates': {
        updates: [
          update('b', '2026-09-30', 'MFM 1.5'),
          update('a', '2026-07-22', 'Summer 2026 Faction Packs'),
        ],
      },
    });
    renderWithRouter(
      <MetaPage search={{ from: '2026-08-01', to: '2026-10-03' }} onSearchChange={vi.fn()} />,
    );
    await waitFor(() => {
      expect(JSON.stringify(fetchMock.mock.calls)).toContain(
        'recentFrom=2026-09-30&recentTo=2026-10-03&priorFrom=2026-07-22&priorTo=2026-09-29',
      );
    });
    expect(await screen.findByTitle('MFM 1.5 vs Summer 2026 Faction Packs')).toBeInTheDocument();
  });

  it('offers the game updates next to the dates', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse(),
      'GET /api/updates': {
        updates: [
          {
            id: 'a',
            name: 'Sep 2026 · MFM',
            autoName: 'Sep 2026 · MFM',
            start: '2026-09-30',
            autoStart: '2026-09-30',
            merged: false,
            hidden: false,
            events: 4,
            summary: '',
            added: false,
            suggestions: ['Sep 2026 · MFM'],
          },
        ],
      },
    });
    renderWithRouter(<MetaPage search={{}} onSearchChange={vi.fn()} />);
    expect(await screen.findByRole('combobox', { name: 'Update' })).toBeInTheDocument();
  });

  it('shows archetypes by default, and switches to armies', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    const onSearchChange = vi.fn();
    renderWithRouter(<MetaPage search={{}} onSearchChange={onSearchChange} />);
    expect(await screen.findByText('Kult of Speed + Wreckas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show Orks detachments' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Armies' }));
    expect(onSearchChange).toHaveBeenCalledWith({ view: 'armies' });
  });

  it('keeps the archetype view’s factions in the search', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    const onSearchChange = vi.fn();
    renderWithRouter(<MetaPage search={{ factions: 'Necrons' }} onSearchChange={onSearchChange} />);
    expect(await screen.findByText('Hypercrypt Legion')).toBeInTheDocument();
    expect(screen.queryByText('Kult of Speed + Wreckas')).not.toBeInTheDocument();
  });

  it('shows the faction table, the unloaded-events notice and what top teams bring', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    renderWithRouter(<MetaPage search={{ view: 'armies' }} onSearchChange={vi.fn()} />);
    expect(await screen.findByText('Orks')).toBeInTheDocument();
    expect(screen.getByText(/2 big events in this range aren’t loaded yet/)).toBeInTheDocument();
    expect(screen.getByText('What top teams bring')).toBeInTheDocument();
    expect(screen.getByText('+3.0 pp')).toBeInTheDocument();
    expect(screen.getByText(/Based on 2 team events/)).toBeInTheDocument();
  });

  it('has no team section without team data', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse({ teams: null, teamEventsCounted: 0 }) });
    renderWithRouter(<MetaPage search={{ view: 'armies' }} onSearchChange={vi.fn()} />);
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
    renderWithRouter(<MetaPage search={{ view: 'armies' }} onSearchChange={vi.fn()} />);
    expect(await screen.findByText('No big events in this range.')).toBeInTheDocument();
  });

  it('sorts by the reliable win rate unless another column is chosen', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    renderWithRouter(<MetaPage search={{ view: 'armies' }} onSearchChange={vi.fn()} />);
    await screen.findByText('Orks');
    expect(screen.getByRole('columnheader', { name: /Reliable/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('keeps sort and expanded factions in the search', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    const onSearchChange = vi.fn();
    renderWithRouter(
      <MetaPage search={{ type: 'teams', view: 'armies' }} onSearchChange={onSearchChange} />,
    );
    await screen.findByText('Orks');
    fireEvent.click(screen.getByRole('button', { name: 'Players' }));
    expect(onSearchChange).toHaveBeenCalledWith({
      type: 'teams',
      view: 'armies',
      sort: 'players',
      dir: 'desc',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show Orks detachments' }));
    expect(onSearchChange).toHaveBeenCalledWith({
      type: 'teams',
      view: 'armies',
      expanded: 'Orks',
    });
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
            eventPlayerCount: 96,
            eventTeamCount: 12,
            eventFieldElo: null,
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
    renderWithRouter(<MetaPage search={{ view: 'armies' }} onSearchChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '20 Orks players' }));
    expect(await screen.findByText('Ada Archer')).toBeInTheDocument();
    expect(screen.getByText('Alpha Squad · #2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Medium event' })).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute(
      'href',
      '/events/EVT1?tab=players&list=PL-ADA',
    );
  });

  it('shows the API error with a retry', async () => {
    stubFetchRoutes({
      'GET /api/meta': () =>
        Response.json(
          { error: { code: 'INTERNAL', message: 'Something went wrong' } },
          { status: 500 },
        ),
    });
    renderWithRouter(<MetaPage search={{ view: 'armies' }} onSearchChange={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('keeps Min players between 1 and 50', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    const onSearchChange = vi.fn();
    renderWithRouter(<MetaPage search={{ view: 'armies' }} onSearchChange={onSearchChange} />);
    await screen.findByText('Orks');
    fireEvent.change(screen.getByLabelText('Min players'), { target: { value: '0' } });
    expect(onSearchChange).not.toHaveBeenCalledWith({ view: 'armies', minPlayers: 0 });
    fireEvent.change(screen.getByLabelText('Min players'), { target: { value: '12' } });
    expect(onSearchChange).toHaveBeenCalledWith({ view: 'armies', minPlayers: 12 });
  });

  it('shows the new row’s players, not the previous row’s, while they load', async () => {
    const player = (name: string) => ({
      ...aPlayer({ name, faction: 'Orks' }),
      eventId: 'EVT1',
      eventName: 'Sample Team Open',
      eventStartDate: '2026-03-28T09:00:00.000Z',
      eventPlayerCount: 96,
      eventTeamCount: 12,
      eventFieldElo: null,
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
    renderWithRouter(<MetaPage search={{ view: 'armies' }} onSearchChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '20 Orks players' }));
    expect(await screen.findByText('Ada Archer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '10 Necrons players' }));
    await screen.findByRole('heading', { name: 'Necrons' });
    expect(screen.queryByText('Ada Archer')).not.toBeInTheDocument();
  });
});

describe('reliableTone', () => {
  it('is good from 50% shown (surely above even), bad below 45%, by the number shown', () => {
    expect(reliableTone(0.496)).toBe('good'); // shows 50%
    expect(reliableTone(0.494)).toBe('even'); // shows 49%
    expect(reliableTone(0.446)).toBe('even'); // shows 45%
    expect(reliableTone(0.444)).toBe('bad'); // shows 44%
  });
});

describe('winRateTone', () => {
  it('colours by the rounded percentage shown, so two "45%" never differ', () => {
    expect(winRateTone(0.446)).toBe('even'); // shows 45%
    expect(winRateTone(0.452)).toBe('even'); // shows 45%
    expect(winRateTone(0.444)).toBe('bad'); // shows 44%
    expect(winRateTone(0.554)).toBe('even'); // shows 55%
    expect(winRateTone(0.556)).toBe('good'); // shows 56%
  });
});
