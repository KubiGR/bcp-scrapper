import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatEventDates } from '../../lib/format';
import { renderWithProviders } from '../../test/render';
import { anEvent } from '../../test/sample-data';
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
  fetching: false,
  page: 1,
  onPageChange: vi.fn(),
  emptyText: 'Nothing here',
};

describe('EventsTable', () => {
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
    expect(screen.getByText('432 players · 108 teams')).toBeInTheDocument();
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

  it('names the dates, place and size under the name too, for phones where those columns are hidden', () => {
    const event = anEvent({ city: 'Athens', country: 'Greece', playerCount: 44, teamCount: null });
    renderWithProviders(
      <EventsTable
        {...props}
        onOpen={vi.fn()}
        response={{ items: [event], total: 1, page: 1, pageSize: 25 }}
      />,
    );
    const line = `${formatEventDates(event.startDate, event.endDate)} · Athens, Greece · 44 players`;
    // Compared raw: the dates hold a thin space the default text matcher would normalize.
    expect(
      screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === line),
    ).toBeInTheDocument();
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
