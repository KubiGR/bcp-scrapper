import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { MatchupsPage } from './MatchupsPage';
import type { CrossSearch } from './matchups-queries';

/** MatchupsPage owns no state itself; a small stateful wrapper stands in for the URL-backed
 * parent, so a tick or filter change round-trips like it does in the app. */
function StatefulMatchupsPage({ initial = {} }: { initial?: CrossSearch }) {
  const [search, setSearch] = useState<CrossSearch>(initial);
  return <MatchupsPage search={search} onSearchChange={setSearch} />;
}

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
  detachments: [],
  ...overrides,
});

describe('MatchupsPage', () => {
  it('shows the dates and the matrix, with the event list behind an Events button', async () => {
    stubFetchRoutes({
      'GET /api/matchups': response({
        events: [anEvent(), anEvent({ id: 'EVT2', name: 'Other Open', included: false })],
      }),
    });
    renderWithRouter(<MatchupsPage search={{}} onSearchChange={vi.fn()} />);

    expect(await screen.findByLabelText('Dates')).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Orks' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sample Team Open' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Events · 1 of 2' }));
    expect(await screen.findByRole('link', { name: 'Sample Team Open' })).toBeInTheDocument();
  });

  it('says when events in range are missing pairings, pointing to Events', async () => {
    stubFetchRoutes({
      'GET /api/matchups': response({
        events: [anEvent(), anEvent({ id: 'EVT2', name: 'Other Open', pairings: 'missing' })],
      }),
    });
    renderWithRouter(<MatchupsPage search={{}} onSearchChange={vi.fn()} />);
    expect(
      await screen.findByText('1 event is missing pairings: fetch them under Events.'),
    ).toBeInTheDocument();
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

  it('never selects the disabled Game points metric when scoring is inconsistent', async () => {
    stubFetchRoutes({
      'GET /api/matchups': response({ scoring: { consistent: false, scale: null } }),
    });
    renderWithRouter(<MatchupsPage search={{ metric: 'points' }} onSearchChange={vi.fn()} />);

    const winRate = await screen.findByRole('radio', { name: 'Win rate' });
    await waitFor(() => {
      expect(winRate).toBeChecked();
    });
    expect(screen.getByRole('radio', { name: 'Game points' })).toBeDisabled();
  });

  it('shows a Clear filter empty state when a disposition filter matches no games', async () => {
    const onSearchChange = vi.fn();
    stubFetchRoutes({
      'GET /api/matchups': response({ matrix: { factions: [], games: 0, cells: [] } }),
    });
    renderWithRouter(
      <MatchupsPage search={{ dispositions: 'Disruption' }} onSearchChange={onSearchChange} />,
    );

    expect(await screen.findByText('No games match this filter.')).toBeInTheDocument();
    expect(
      screen.queryByText('Tick at least one event with pairings to see matchups.'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ dispositions: undefined }),
    );
  });

  it('keeps the event list and its checkbox mounted while a tick change is pending, instead of blanking the page', async () => {
    let resolveSecond: (() => void) | undefined;
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    let calls = 0;
    stubFetchRoutes({
      'GET /api/matchups': () => {
        calls += 1;
        if (calls === 1) return Promise.resolve(Response.json(response()));
        return second.then(() => Response.json(response()));
      },
    });
    renderWithRouter(<StatefulMatchupsPage initial={{ include: 'EVT1' }} />);

    fireEvent.click(await screen.findByRole('button', { name: /^Events ·/ }));
    const checkbox = await screen.findByRole('checkbox', { name: 'Include Sample Team Open' });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);

    // While the second (pending) fetch is in flight, the event list and its checkbox stay mounted
    // (not replaced by a full-page skeleton).
    expect(await screen.findByRole('link', { name: 'Sample Team Open' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include Sample Team Open' })).toBeInTheDocument();

    resolveSecond?.();
    await waitFor(() => {
      expect(calls).toBe(2);
    });
  });

  it('shows a live progress line while an event is fetching, and refetches', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubFetchRoutes({
      'GET /api/matchups': response({ events: [anEvent({ pairings: 'fetching' })] }),
    });
    renderWithRouter(<MatchupsPage search={{}} onSearchChange={vi.fn()} />);

    const progress = await screen.findByText(/Fetching pairings for 1 event/);
    expect(progress).toHaveAttribute('aria-live', 'polite');

    const matrixCalls = () =>
      fetchMock.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.includes('/api/matchups?'),
      ).length;
    const before = matrixCalls();
    await act(() => vi.advanceTimersByTimeAsync(31_000));
    await waitFor(() => {
      expect(matrixCalls()).toBeGreaterThan(before);
    });
    vi.useRealTimers();
  });
});
