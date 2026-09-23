import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aSyncRun } from '../../test/sample-data';
import { CoverageNotice } from './CoverageNotice';

const window = { from: '2026-01-01', to: '2026-12-31' };
const coverage = (ranges: { from: string; to: string }[]) => ({
  ranges: ranges.map((range) => ({ ...range, syncedAt: '2026-09-23T10:00:00.000Z' })),
  lastSyncedAt: '2026-09-23T10:00:00.000Z',
  activeRun: null,
});

describe('CoverageNotice', () => {
  it('offers to fetch only the span that has not been fetched', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/catalog/coverage': coverage([{ from: '2026-01-01', to: '2026-06-30' }]),
      'POST /api/sync': aSyncRun({ kind: 'catalog', eventId: null, status: 'succeeded' }),
      'GET /api/events': { items: [], total: 0, page: 1, pageSize: 25 },
    });
    renderWithProviders(<CoverageNotice window={window} />);

    expect(await screen.findByText(/hasn't been fetched from BCP yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/sync')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/sync');
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      kind: 'catalog',
      from: '2026-07-01',
      to: '2026-12-31',
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
