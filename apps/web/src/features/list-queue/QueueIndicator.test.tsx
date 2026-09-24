import type { ListQueueState } from '@bcp/shared';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { QueueIndicator } from './QueueIndicator';

const state = (changes: Partial<ListQueueState> = {}): ListQueueState => ({
  paused: false,
  pausedReason: null,
  pausedUntil: null,
  intervalMs: 5000,
  totals: { queued: 0, fetching: 0, failed: 0 },
  estimatedSeconds: null,
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
    const fetchMock = stubFetchRoutes({ 'GET /api/list-queue': state() });
    renderInRouter();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /Lists/ })).toBeNull();
  });

  it('shows how many lists are queued and roughly how long they take', async () => {
    stubFetchRoutes({
      'GET /api/list-queue': state({
        totals: { queued: 34, fetching: 1, failed: 0 },
        estimatedSeconds: 175,
      }),
    });
    renderInRouter();
    expect(
      await screen.findByRole('button', { name: /Lists · 35 queued · ~3 min/ }),
    ).toBeInTheDocument();
  });

  it('turns red with a Settings link when BCP rejected the login', async () => {
    stubFetchRoutes({
      'GET /api/list-queue': state({
        paused: true,
        pausedReason: 'login-rejected',
        totals: { queued: 5, fetching: 0, failed: 0 },
      }),
    });
    renderInRouter();
    expect(
      await screen.findByRole('button', { name: /Lists paused: login expired/ }),
    ).toBeInTheDocument();
  });
});
