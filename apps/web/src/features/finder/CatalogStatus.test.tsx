import { latestWindow } from '@bcp/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aSyncRun } from '../../test/sample-data';
import { CatalogStatus } from './CatalogStatus';

const coverage = (activeRun: unknown = null) => ({
  ranges: [],
  lastSyncedAt: null,
  activeRun,
});
const catalogRun = (overrides: Parameters<typeof aSyncRun>[0]) =>
  aSyncRun({ kind: 'catalog', eventId: null, total: null, status: 'running', ...overrides });

const callsTo = (fetchMock: ReturnType<typeof stubFetchRoutes>, url: string) =>
  fetchMock.mock.calls.filter(([called]) => called === url).length;

afterEach(() => {
  vi.useRealTimers();
});

describe('CatalogStatus', () => {
  it('refreshes the coverage as soon as the latest refresh has started a run', async () => {
    const run = catalogRun({ id: 3, done: 0, range: latestWindow(new Date()) });
    const fetchMock = stubFetchRoutes({
      'POST /api/catalog/latest': { window: run.range, run },
      'GET /api/catalog/coverage': coverage(),
      'GET /api/sync-runs/3': run,
    });
    renderWithProviders(<CatalogStatus />);

    expect(await screen.findByText(/Updating the catalogue from BCP/)).toBeInTheDocument();
    await waitFor(() => {
      expect(callsTo(fetchMock, '/api/catalog/coverage')).toBe(2);
    });
    expect(callsTo(fetchMock, '/api/sync-runs/3')).toBe(0);
  });

  it('shows a run active elsewhere from the coverage (not polling it twice), then refreshes events', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const active = catalogRun({ id: 9, done: 5, range: { from: '2026-01-01', to: '2026-03-31' } });
    let running = true;
    const fetchMock = stubFetchRoutes({
      'POST /api/catalog/latest': { window: latestWindow(new Date()), run: null },
      'GET /api/catalog/coverage': () => Response.json(coverage(running ? active : null)),
      'GET /api/sync-runs/9': active,
    });
    const { queryClient } = renderWithProviders(<CatalogStatus />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    expect((await screen.findByText(/Updating the catalogue from BCP/)).textContent).toBe(
      'Updating the catalogue from BCP… 5 found',
    );
    running = false;
    await act(() => vi.advanceTimersByTimeAsync(2500));
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['events'] });
    });
    // The coverage query already polls the run; nothing else does.
    expect(callsTo(fetchMock, '/api/sync-runs/9')).toBe(0);
  });
});
