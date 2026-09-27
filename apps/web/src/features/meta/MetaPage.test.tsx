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

  it('keeps sort and expanded factions in the search', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    const onSearchChange = vi.fn();
    renderWithRouter(<MetaPage search={{ type: 'teams' }} onSearchChange={onSearchChange} />);
    await screen.findByText('Orks');
    fireEvent.click(screen.getByRole('button', { name: 'Win rate' }));
    expect(onSearchChange).toHaveBeenCalledWith({ type: 'teams', sort: 'winRate' });
    fireEvent.click(screen.getByRole('button', { name: 'Show Orks detachments' }));
    expect(onSearchChange).toHaveBeenCalledWith({ type: 'teams', expanded: 'Orks' });
  });

  it('opens the players of a row, with their lists', async () => {
    stubFetchRoutes({
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
    });
    renderWithRouter(<MetaPage search={{}} onSearchChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '20 Orks players' }));
    expect(await screen.findByText('Ada Archer')).toBeInTheDocument();
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
});
