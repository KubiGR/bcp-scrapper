import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatEventDates } from '../../lib/format';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEvent } from '../../test/sample-data';
import { twoUpdates } from '../updates/test-updates';
import { EventsTable } from './EventsTable';

// mantine-datatable decides per-column visibility with `useMediaQuery`, which calls
// `window.matchMedia` once after mount even for columns with no `visibleMediaQuery`. The jsdom
// stub in test/setup.ts always reports no match, which would hide every column shortly after
// mount; report a match here so the table's columns render as they do in a real browser.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

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
    // The size with flames for a major event, the teams under it.
    expect(screen.getAllByText(/432 players/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Major event' }).length).toBeGreaterThan(0);
    expect(screen.getByText('108 teams')).toBeInTheDocument();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    // A real link (⌘-click opens a new tab), with phrasing content only: no <p>.
    const link = screen.getByRole('link', { name: 'Sample Team Open' });
    expect(link).toHaveAttribute('href', '/events/EVT1?tab=players');
    expect(link.querySelector('p')).toBeNull();
    fireEvent.click(screen.getByText('Sample Team Open'));
    expect(onOpen).toHaveBeenCalledWith('EVT1');
  });

  it('shows a Rounds column with each event’s round count, or "—" when unknown', () => {
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
    expect(screen.getByText('Rounds')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
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
    expect(screen.getByRole('columnheader', { name: 'Elo' })).toBeInTheDocument();
    // In its column, and in the phone line under the name.
    expect(
      screen
        .getAllByLabelText('Elite field: average wh40k-elo of the field 1712')
        .map((e) => e.textContent),
    ).toEqual(['Elo 1712', '1712']);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('names the dates and place under the name, and the size badge by it, for phones where those columns are hidden', () => {
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
    // Once in the name cell (phones), once in the Size column.
    expect(screen.getAllByText('44 players')).toHaveLength(2);
  });

  it('sorts by size or date from the headers: high to low, low to high, then off', () => {
    const onSortChange = vi.fn();
    const response = { items: [anEvent()], total: 1, page: 1, pageSize: 25 };
    const { rerender } = renderWithProviders(
      <EventsTable {...props} onOpen={vi.fn()} response={response} onSortChange={onSortChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Size/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'players', dir: 'desc' });
    rerender(
      <EventsTable
        {...props}
        sort="players"
        onOpen={vi.fn()}
        response={response}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Size/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'players', dir: 'asc' });
    rerender(
      <EventsTable
        {...props}
        sort="players"
        dir="asc"
        onOpen={vi.fn()}
        response={response}
        onSortChange={onSortChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Size/ }));
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

  it('by date, starts each week with its name; by size, it is one list', () => {
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
    expect(screen.getAllByText(/^Week of /).map((w) => w.textContent)).toEqual([
      'Week of 6–12 Apr',
      'Week of 23–29 Mar',
    ]);
    // Every other week is shaded, so the weeks read as groups.
    const shade = (name: string) =>
      screen.getByText(name).closest('tr')?.getAttribute('data-week-shade');
    expect([shade('Big GT'), shade('Small RTT'), shade('March Open')]).toEqual([
      'even',
      'even',
      'odd',
    ]);
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
    fireEvent.click(screen.getByRole('button', { name: '25' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '100' }));
    expect(onPerPageChange).toHaveBeenCalledWith(100);
  });
});
