import type { FetchQueueState, QueueDetails } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { listJobTotals } from '../../test/sample-data';
import { QueuePage } from './QueuePage';

const state: FetchQueueState = {
  paused: false,
  pausedReason: null,
  pausedUntil: null,
  intervalMs: 5000,
  totals: listJobTotals({ queued: 2, fetching: 0, failed: 3 }),
  estimatedSeconds: 10,
  auto: { enabled: true, jobs: 1, events: 1 },
};

const job = {
  kind: 'list' as const,
  eventId: 'EVT1',
  eventName: 'Sample Team Open',
  round: null,
};

const details = (overrides: Partial<QueueDetails> = {}): QueueDetails => ({
  failures: [
    {
      code: 'BCP_UNAVAILABLE',
      final: false,
      count: 2,
      jobs: [
        {
          ...job,
          id: 1,
          playerName: 'Ada Archer',
          error: 'BCP answered 503',
          attempts: 3,
          failedAt: '2026-09-28T10:00:00.000Z',
        },
        {
          ...job,
          id: 2,
          kind: 'pairings-round',
          playerName: null,
          round: 4,
          error: 'BCP answered 503',
          attempts: 3,
          failedAt: '2026-09-28T09:00:00.000Z',
        },
      ],
    },
    {
      code: 'NO_LIST',
      final: true,
      count: 1,
      jobs: [
        {
          ...job,
          id: 3,
          playerName: 'Ben Brass',
          error: 'No list on BCP',
          attempts: 1,
          failedAt: null,
        },
      ],
    },
  ],
  next: [
    { ...job, id: 4, playerName: 'Cara Cole', status: 'fetching', origin: 'user' },
    { ...job, id: 5, playerName: 'Dan Dune', status: 'queued', origin: 'auto' },
  ],
  ...overrides,
});

const routes = (body: QueueDetails = details()) => ({
  'GET /api/fetch-queue/details': body,
  'GET /api/fetch-queue': state,
  'GET /api/auth/me': { authRequired: false, user: null },
  'POST /api/fetch-queue/retry-failed': { requeued: 2 },
});

describe('QueuePage', () => {
  it('groups failures by reason, explaining each, and lists what failed on expanding', async () => {
    stubFetchRoutes(routes());
    renderWithRouter(<QueuePage />);
    const group = await screen.findByRole('button', { name: /BCP unavailable · 2/ });
    expect(screen.getByText(/BCP didn’t answer, or answered with an error/)).toBeInTheDocument();
    fireEvent.click(group);
    const failures = within(await screen.findByRole('table', { name: 'BCP unavailable' }));
    expect(failures.getByText('Ada Archer')).toBeInTheDocument();
    expect(failures.getByText('Round 4')).toBeInTheDocument();
    expect(failures.getAllByRole('link', { name: 'Sample Team Open' })[0]).toHaveAttribute(
      'href',
      '/events/EVT1?tab=players',
    );
  });

  it('retries one reason, but never the final "no list on BCP"', async () => {
    const fetchMock = stubFetchRoutes(routes());
    renderWithRouter(<QueuePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry BCP unavailable' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ code: 'BCP_UNAVAILABLE' });
    expect(screen.queryByRole('button', { name: 'Retry No list on BCP' })).not.toBeInTheDocument();
    expect(screen.getByText(/nothing to retry/i)).toBeInTheDocument();
  });

  it('lists what runs next, the one being fetched first', async () => {
    stubFetchRoutes(routes());
    renderWithRouter(<QueuePage />);
    const next = within(await screen.findByRole('table', { name: 'Up next' }));
    const rows = next.getAllByRole('row').slice(1);
    expect(rows[0]?.textContent).toContain('Cara Cole');
    expect(rows[0]?.textContent).toContain('Fetching');
    expect(rows[1]?.textContent).toContain('Background');
  });

  it('says when nothing failed and nothing waits', async () => {
    stubFetchRoutes(routes(details({ failures: [], next: [] })));
    renderWithRouter(<QueuePage />);
    expect(await screen.findByText('Nothing has failed.')).toBeInTheDocument();
    expect(screen.getByText('Nothing is waiting.')).toBeInTheDocument();
  });
});
