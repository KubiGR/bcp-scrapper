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
    // The size as a badge (a major event), the teams under it.
    expect(screen.getAllByText('432 players')[0]).toHaveAttribute('data-tier', 'major');
    expect(screen.getByText('108 teams')).toBeInTheDocument();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    // Phrasing content only inside a button: no <p>.
    expect(screen.getByRole('button', { name: 'Sample Team Open' }).querySelector('p')).toBeNull();
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
            anEvent({ bcpId: 'EVT1', name: 'Sample Team Open', roundCount: 5 }),
            anEvent({ bcpId: 'EVT2', name: 'Other Open', roundCount: 0 }),
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
});
