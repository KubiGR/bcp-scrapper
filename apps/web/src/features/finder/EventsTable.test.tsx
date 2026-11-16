import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { formatEventDates } from '../../lib/format';
import { pickOption } from '../../test/pick-option';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEvent } from '../../test/sample-data';
import { twoUpdates } from '../updates/test-updates';
import { EventsTable } from './EventsTable';

const props = {
  sort: 'date' as const,
  dir: 'desc' as const,
  perPage: 25 as const,
  onPerPageChange: vi.fn(),
  onSortChange: vi.fn(),
  fetching: false,
  page: 1,
  onPageChange: vi.fn(),
  emptyText: 'Nothing here',
};

describe('EventsTable', () => {
  it('names each event’s game update under its date', async () => {
    stubFetchRoutes({ 'GET /api/updates': twoUpdates() });
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={vi.fn()}
        response={{
          items: [
            anEvent({ bcpId: 'E1', name: 'Summer GT', startDate: '2026-07-30T09:00:00.000Z' }),
            anEvent({ bcpId: 'E2', name: 'Spring RTT', startDate: '2026-05-01T09:00:00.000Z' }),
          ],
          total: 2,
          page: 1,
          pageSize: 25,
        }}
      />,
    );
    expect(await screen.findByText('Jul 2026 · MFM')).toBeInTheDocument();
    expect(screen.getByText('Before first update')).toBeInTheDocument();
  });

  it('marks an event that started in the last week with a leaf', () => {
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={vi.fn()}
        response={{
          items: [
            anEvent({ startDate: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString() }),
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'New this week' })).toBeInTheDocument();
  });

  it('lists events with size and badges, and opens one on click', () => {
    const onOpen = vi.fn();
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={onOpen}
        response={{
          items: [anEvent({ playerCount: 432, teamCount: 108 })],
          total: 1,
          page: 1,
          pageSize: 25,
        }}
      />,
    );
    // The size with flames for a major event, the teams by it.
    expect(screen.getByText('players · 108 teams').parentElement).toHaveTextContent(
      '432players · 108 teams',
    );
    expect(screen.getByRole('img', { name: 'Major event' })).toBeInTheDocument();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    // A real link (⌘-click opens a new tab), with phrasing content only: no <p>.
    const link = screen.getByRole('link', { name: 'Sample Team Open' });
    expect(link).toHaveAttribute('href', '/events/EVT1?tab=players');
    expect(link.querySelector('p')).toBeNull();
    fireEvent.click(screen.getByText('Sample Team Open'));
    expect(onOpen).toHaveBeenCalledWith('EVT1');
  });

  it('shows each event’s round count, or "—" when unknown', () => {
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={vi.fn()}
        response={{
          items: [
            anEvent({ bcpId: 'EVT1', name: 'Sample Team Open', roundCount: 5, fieldElo: 1700 }),
            anEvent({ bcpId: 'EVT2', name: 'Other Open', roundCount: 0, fieldElo: 1700 }),
          ],
          total: 2,
          page: 1,
          pageSize: 25,
        }}
      />,
    );
    const rounds = screen.getAllByText('rounds').map((label) => label.previousSibling?.textContent);
    expect(rounds).toEqual(['5', '—']);
  });

  it('shows each event’s field Elo, or "—" when too few players are rated', () => {
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={vi.fn()}
        response={{
          items: [
            anEvent({ bcpId: 'EVT1', name: 'Strong Open', roundCount: 5, fieldElo: 1712 }),
            anEvent({ bcpId: 'EVT2', name: 'Unrated Open', roundCount: 5, fieldElo: null }),
          ],
          total: 2,
          page: 1,
          pageSize: 25,
        }}
      />,
    );
    expect(
      screen
        .getAllByLabelText('Elite field: average wh40k-elo of the field 1712')
        .map((e) => e.textContent),
    ).toEqual(['1712']);
    const elos = screen
      .getAllByText('field Elo')
      .map((label) => label.previousSibling?.textContent);
    expect(elos).toEqual(['1712', '—']);
  });

  it('names the dates and place under the name', () => {
    const event = anEvent({ city: 'Athens', country: 'Greece', playerCount: 44, teamCount: null });
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={vi.fn()}
        response={{ items: [event], total: 1, page: 1, pageSize: 25 }}
      />,
    );
    const line = `${formatEventDates(event.startDate, event.endDate)} · Athens, Greece`;
    // Compared raw: the dates hold a thin space the default text matcher would normalize.
    expect(
      screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === line),
    ).toBeInTheDocument();
  });

  it('sorts by the order picked; newest first is the default', async () => {
    const onSortChange = vi.fn();
    const response = { items: [anEvent()], total: 1, page: 1, pageSize: 25 };
    const { rerender } = renderWithProviders(
      <EventsTable {...props} onOpen={vi.fn()} response={response} onSortChange={onSortChange} />,
    );
    const pick = (label: string) => pickOption('Sort by', label);
    await pick('Biggest first');
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'players', dir: 'desc' });
    await pick('Smallest first');
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'players', dir: 'asc' });
    await pick('Oldest first');
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'date', dir: 'asc' });
    // Newest first is the default: picking it clears the sort.
    rerender(
      <EventsTable
        {...props}
        sort="players"
        onOpen={vi.fn()}
        response={response}
        onSortChange={onSortChange}
      />,
    );
    await pick('Newest first');
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });

  it('shows the empty text', () => {
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={vi.fn()}
        response={{ items: [], total: 0, page: 1, pageSize: 25 }}
      />,
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('by date, groups the events by week; by size, it is one list', () => {
    const response = {
      items: [
        anEvent({ bcpId: 'E1', name: 'Big GT', startDate: '2026-04-10T08:00:00.000Z' }),
        anEvent({ bcpId: 'E2', name: 'Small RTT', startDate: '2026-04-12T08:00:00.000Z' }),
        anEvent({ bcpId: 'E3', name: 'March Open', startDate: '2026-03-28T08:00:00.000Z' }),
      ],
      total: 3,
      page: 1,
      pageSize: 25,
    };
    const { rerender } = renderWithProviders(
      <EventsTable {...props} onOpen={vi.fn()} response={response} />,
    );
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Week of 6–12 Apr2 events', 'Week of 23–29 Mar1 event']);
    rerender(<EventsTable {...props} sort="players" onOpen={vi.fn()} response={response} />);
    expect(screen.queryByText(/^Week of /)).toBeNull();
  });

  it('offers 25, 50 or 100 events per page', async () => {
    const onPerPageChange = vi.fn();
    renderWithProviders(
      <EventsTable
        {...props}
        onPerPageChange={onPerPageChange}
        onOpen={vi.fn()}
        response={{ items: [anEvent()], total: 120, page: 1, pageSize: 25 }}
      />,
    );
    await pickOption('Per page', '100');
    expect(onPerPageChange).toHaveBeenCalledWith(100);
  });
});
