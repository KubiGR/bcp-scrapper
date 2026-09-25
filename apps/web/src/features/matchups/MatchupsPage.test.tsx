import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { MatchupsPage } from './MatchupsPage';

const anEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'EVT1',
  name: 'Sample Team Open',
  startDate: '2026-01-05T00:00:00.000Z',
  playerCount: 96,
  teamCount: 12,
  roundCount: 5,
  pairings: 'synced',
  included: true,
  ...overrides,
});

const response = (overrides: Record<string, unknown> = {}) => ({
  events: [anEvent()],
  matrix: {
    factions: ['Orks', 'Necrons'],
    games: 3,
    cells: [
      {
        row: 'Orks',
        col: 'Necrons',
        games: 3,
        wins: 1,
        draws: 1,
        losses: 1,
        winRate: 0.5,
        avgPoints: 10,
      },
    ],
  },
  scoring: { consistent: true, scale: 20 },
  ...overrides,
});

describe('MatchupsPage', () => {
  it('renders the date range inputs, the event list and the matrix', async () => {
    stubFetchRoutes({ 'GET /api/matchups': response() });
    renderWithRouter(<MatchupsPage search={{}} onSearchChange={vi.fn()} />);

    expect(await screen.findByLabelText('Dates')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Sample Team Open' })).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Orks' })).toBeInTheDocument();
  });

  it('shows an empty state instead of an empty table when nothing is included', async () => {
    stubFetchRoutes({
      'GET /api/matchups': response({
        events: [anEvent({ included: false, pairings: 'missing' })],
        matrix: { factions: [], games: 0, cells: [] },
      }),
    });
    renderWithRouter(<MatchupsPage search={{}} onSearchChange={vi.fn()} />);

    expect(
      await screen.findByText('Tick at least one event with pairings to see matchups.'),
    ).toBeInTheDocument();
  });

  it('shows an empty state when included events have zero games', async () => {
    stubFetchRoutes({
      'GET /api/matchups': response({ matrix: { factions: [], games: 0, cells: [] } }),
    });
    renderWithRouter(<MatchupsPage search={{}} onSearchChange={vi.fn()} />);

    expect(
      await screen.findByText('Tick at least one event with pairings to see matchups.'),
    ).toBeInTheDocument();
  });

  it('shows only the no-events message when the range has no events at all', async () => {
    stubFetchRoutes({
      'GET /api/matchups': response({
        events: [],
        matrix: { factions: [], games: 0, cells: [] },
      }),
    });
    renderWithRouter(<MatchupsPage search={{}} onSearchChange={vi.fn()} />);

    expect(await screen.findByText('No team events in this range.')).toBeInTheDocument();
    expect(
      screen.queryByText('Tick at least one event with pairings to see matchups.'),
    ).not.toBeInTheDocument();
  });

  it('shows a live progress line while an event is fetching, and refetches', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/matchups': response({ events: [anEvent({ pairings: 'fetching' })] }),
    });
    renderWithRouter(<MatchupsPage search={{}} onSearchChange={vi.fn()} />);

    const progress = await screen.findByText(/Fetching pairings for 1 event/);
    expect(progress).toHaveAttribute('aria-live', 'polite');

    await waitFor(
      () => {
        expect(
          fetchMock.mock.calls.filter(
            ([url]) => typeof url === 'string' && url.includes('/api/matchups?'),
          ).length,
        ).toBeGreaterThan(1);
      },
      { timeout: 6000, interval: 200 },
    );
  }, 8000);
});
