import { addDays, toIsoDate, type DateRange } from '@bcp/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatIsoDay } from '../../lib/format';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aSyncRun } from '../../test/sample-data';
import { CoverageNotice } from './CoverageNotice';

// A past year: days after today can never count as fetched (see the future-days test).
const window = { from: '2025-01-01', to: '2025-12-31' };
const coverage = (ranges: DateRange[]) => ({
  ranges: ranges.map((range) => ({ ...range, syncedAt: '2026-09-23T10:00:00.000Z' })),
  lastSyncedAt: '2026-09-23T10:00:00.000Z',
  activeRun: null,
});
const catalogRun = (range: DateRange, overrides: Parameters<typeof aSyncRun>[0] = {}) =>
  aSyncRun({ kind: 'catalog', eventId: null, total: null, range, ...overrides });

/** The ranges POSTed to /api/sync, in order. */
const postedRanges = (fetchMock: ReturnType<typeof stubFetchRoutes>) =>
  fetchMock.mock.calls
    .filter(([url, init]) => url === '/api/sync' && init?.method === 'POST')
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    .map(([, init]) => JSON.parse(String(init?.body)) as unknown);

/** Answers POST /api/sync with a finished run of whatever range was requested. */
const echoRange = (_url: string, init?: RequestInit) => {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
  const { from, to } = JSON.parse(String(init?.body)) as DateRange;
  return Response.json(catalogRun({ from, to }, { status: 'succeeded' }));
};

afterEach(() => {
  vi.useRealTimers();
});

describe('CoverageNotice', () => {
  it('offers to fetch only the span that has not been fetched', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/catalog/coverage': coverage([{ from: '2025-01-01', to: '2025-06-30' }]),
      'POST /api/sync': echoRange,
    });
    renderWithProviders(<CoverageNotice window={window} />);

    expect(await screen.findByText(/hasn't been fetched from BCP yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));

    await waitFor(() => {
      expect(postedRanges(fetchMock)).toEqual([
        { kind: 'catalog', from: '2025-07-01', to: '2025-12-31' },
      ]);
    });
  });

  it('fetches several gaps one at a time, each with exactly its own range', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/catalog/coverage': coverage([{ from: '2025-04-01', to: '2025-06-30' }]),
      'POST /api/sync': echoRange,
    });
    renderWithProviders(<CoverageNotice window={window} />);

    expect((await screen.findByText(/haven't been fetched from BCP yet/)).textContent).toBe(
      "2 date ranges (274 days) haven't been fetched from BCP yet (about 137 requests).",
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));

    await waitFor(() => {
      expect(postedRanges(fetchMock)).toEqual([
        { kind: 'catalog', from: '2025-01-01', to: '2025-03-31' },
        { kind: 'catalog', from: '2025-07-01', to: '2025-12-31' },
      ]);
    });
  });

  it('waits for another catalogue run the API hands back, then asks for its gap again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const gap = { from: '2025-07-01', to: '2025-12-31' };
    const other = catalogRun(
      { from: '2025-08-24', to: '2025-09-30' },
      { id: 7, status: 'running' },
    );
    let posts = 0;
    const fetchMock = stubFetchRoutes({
      'GET /api/catalog/coverage': coverage([{ from: '2025-01-01', to: '2025-06-30' }]),
      'POST /api/sync': (url: string, init?: RequestInit) => {
        posts += 1;
        return posts === 1 ? Response.json(other) : echoRange(url, init);
      },
      'GET /api/sync-runs/7': { ...other, status: 'succeeded' },
    });
    renderWithProviders(<CoverageNotice window={window} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Fetch' }));
    expect(
      await screen.findByText('Waiting for the current catalogue refresh…'),
    ).toBeInTheDocument();
    expect(postedRanges(fetchMock)).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(2000));

    await waitFor(() => {
      expect(postedRanges(fetchMock)).toEqual([
        { kind: 'catalog', ...gap },
        { kind: 'catalog', ...gap },
      ]);
    });
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/sync-runs/7')).toBe(true);
  });

  it('does not report future days, which can only be covered up to today', async () => {
    const today = toIsoDate(new Date());
    stubFetchRoutes({
      'GET /api/catalog/coverage': coverage([{ from: addDays(today, -20), to: today }]),
    });
    renderWithProviders(
      <CoverageNotice window={{ from: addDays(today, -30), to: addDays(today, 60) }} />,
    );

    const notice = await screen.findByText(/hasn't been fetched from BCP yet/);
    expect(notice.textContent).toBe(
      `${formatIsoDay(addDays(today, -30))} – ${formatIsoDay(addDays(today, -21))} hasn't been fetched from BCP yet (about 5 requests).`,
    );
  });

  it('offers to fetch a range that lies wholly in the future', async () => {
    const today = toIsoDate(new Date());
    const future = { from: addDays(today, 10), to: addDays(today, 40) };
    const fetchMock = stubFetchRoutes({
      'GET /api/catalog/coverage': coverage([]),
      'POST /api/sync': echoRange,
    });
    renderWithProviders(<CoverageNotice window={future} />);
    expect(
      await screen.findByText('Upcoming events change as organisers add them to BCP.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    await waitFor(() => {
      expect(postedRanges(fetchMock)).toEqual([{ kind: 'catalog', ...future }]);
    });
  });

  it('stays quiet when the whole range is fetched', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/catalog/coverage': coverage([{ from: '2025-01-01', to: '2027-01-01' }]),
    });
    renderWithProviders(<CoverageNotice window={window} />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByText(/hasn't been fetched/)).toBeNull();
  });
});
