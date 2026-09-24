import type { ListQueueState } from '@bcp/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, renderWithRouter, stubFetchRoutes } from '../../test/render';
import { QueueControls } from './QueueControls';

const base: ListQueueState = {
  paused: false,
  pausedReason: null,
  pausedUntil: null,
  intervalMs: 5000,
  totals: { queued: 3, fetching: 1, failed: 2 },
  estimatedSeconds: 20,
};

describe('QueueControls', () => {
  it('shows the totals and pauses the queue', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/list-queue/pause': { ...base, paused: true, pausedReason: 'user' },
    });
    renderWithProviders(<QueueControls state={base} />);
    expect(screen.getByText(/4 in progress/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/list-queue/pause')).toBe(true);
    });
  });

  it('shows why resuming failed', async () => {
    stubFetchRoutes({
      'POST /api/list-queue/resume': () =>
        Response.json(
          { error: { code: 'BCP_AUTH', message: 'BCP still rejects the login.' } },
          { status: 502 },
        ),
    });
    renderWithRouter(
      <QueueControls state={{ ...base, paused: true, pausedReason: 'login-rejected' }} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    expect(await screen.findByText('BCP still rejects the login.')).toBeInTheDocument();
  });

  it('retries all failed lists', async () => {
    const fetchMock = stubFetchRoutes({ 'POST /api/list-queue/retry-failed': { requeued: 2 } });
    renderWithProviders(<QueueControls state={base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry 2 failed' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/list-queue/retry-failed')).toBe(
        true,
      );
    });
  });
});
