import type { FetchQueueState } from '@bcp/shared';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { listJobTotals } from '../../test/sample-data';
import { QueueIndicator } from './QueueIndicator';

const state = (changes: Partial<FetchQueueState> = {}): FetchQueueState => ({
  paused: false,
  pausedReason: null,
  pausedUntil: null,
  intervalMs: 5000,
  totals: listJobTotals({ queued: 0, fetching: 0, failed: 0 }),
  estimatedSeconds: null,
  auto: { enabled: false, jobs: 0, events: 0 },
  ...changes,
});

/** QueueIndicator links to Settings, so it needs a router around it. */
function renderInRouter() {
  const root = createRootRoute({ component: QueueIndicator });
  const router = createRouter({ routeTree: root, history: createMemoryHistory() });
  return renderWithProviders(<RouterProvider router={router} />);
}

describe('QueueIndicator', () => {
  it('is hidden when the queue is empty', async () => {
    const fetchMock = stubFetchRoutes({ 'GET /api/fetch-queue': state() });
    renderInRouter();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /Fetching/ })).toBeNull();
  });

  it('shows how many lists are queued and roughly how long they take', async () => {
    stubFetchRoutes({
      'GET /api/fetch-queue': state({
        totals: listJobTotals({ queued: 34, fetching: 1, failed: 0 }),
        estimatedSeconds: 175,
        auto: { enabled: false, jobs: 0, events: 0 },
      }),
    });
    renderInRouter();
    expect(
      await screen.findByRole('button', { name: /Fetching · 35 jobs · ~3 min/ }),
    ).toBeInTheDocument();
  });

  it('uses the singular "job" for exactly one', async () => {
    stubFetchRoutes({
      'GET /api/fetch-queue': state({
        totals: listJobTotals({ queued: 1, fetching: 0, failed: 0 }),
      }),
    });
    renderInRouter();
    expect(await screen.findByRole('button', { name: /Fetching · 1 job\b/ })).toBeInTheDocument();
  });

  it('shows failures even when nothing is queued', async () => {
    stubFetchRoutes({
      'GET /api/fetch-queue': state({
        totals: listJobTotals({ queued: 0, fetching: 0, failed: 3 }),
      }),
    });
    renderInRouter();
    expect(await screen.findByRole('button', { name: 'Fetching · 3 failed' })).toBeInTheDocument();
  });

  it('shows both queued and failed counts, with the estimate', async () => {
    stubFetchRoutes({
      'GET /api/fetch-queue': state({
        totals: listJobTotals({ queued: 2, fetching: 0, failed: 1 }),
        estimatedSeconds: 10,
        auto: { enabled: false, jobs: 0, events: 0 },
      }),
    });
    renderInRouter();
    expect(
      await screen.findByRole('button', { name: 'Fetching · 2 jobs · 1 failed · ~10 s' }),
    ).toBeInTheDocument();
  });

  it('stays visible when paused with an empty queue, so Resume stays reachable', async () => {
    stubFetchRoutes({
      'GET /api/fetch-queue': state({ paused: true, pausedReason: 'user' }),
    });
    renderInRouter();
    expect(await screen.findByRole('button', { name: 'Fetching · paused' })).toBeInTheDocument();
  });

  it('turns red with a Settings link when BCP rejected the login', async () => {
    stubFetchRoutes({
      'GET /api/fetch-queue': state({
        paused: true,
        pausedReason: 'login-rejected',
        totals: listJobTotals({ queued: 5, fetching: 0, failed: 0 }),
      }),
    });
    renderInRouter();
    expect(
      await screen.findByRole('button', { name: /Fetching paused: login expired/ }),
    ).toBeInTheDocument();
  });
});
