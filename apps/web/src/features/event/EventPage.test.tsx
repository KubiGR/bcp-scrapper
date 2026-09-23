import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aSyncRun } from '../../test/sample-data';
import { EventPage } from './EventPage';

describe('EventPage', () => {
  it('offers to fetch an event that is not in the catalogue yet', async () => {
    stubFetchRoutes({
      'GET /api/events/NOPE': () =>
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'Event NOPE is not in the local catalogue' } },
          { status: 404 },
        ),
    });
    renderWithProviders(<EventPage eventId="NOPE" />);
    expect(await screen.findByText(/isn't in the local catalogue yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch from BCP' })).toBeInTheDocument();
  });

  it('loads a never-synced event from BCP automatically, once', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({
        stale: true,
        lastSyncedAt: null,
        syncs: { event: null, pairings: null, lists: null },
      }),
      'POST /api/sync': aSyncRun({ kind: 'event', status: 'succeeded' }),
    });
    renderWithProviders(<EventPage eventId="EVT1" />);

    expect(await screen.findByRole('heading', { name: 'Sample Team Open' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/sync')).toHaveLength(1);
    });
  });

  it('follows an event sync that is already running instead of starting another', async () => {
    const running = aSyncRun({ kind: 'event', status: 'running', done: 0, finishedAt: null });
    const fetchMock = stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({
        stale: true,
        lastSyncedAt: null,
        syncs: { event: running, pairings: null, lists: null },
      }),
      'GET /api/sync-runs/1': running,
    });
    renderWithProviders(<EventPage eventId="EVT1" />);

    expect(await screen.findByRole('button', { name: 'Refresh from BCP' })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/sync')).toBe(false);
  });

  it('says why the last event sync failed', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({
        syncs: {
          event: aSyncRun({ kind: 'event', status: 'failed', error: 'BCP is unavailable' }),
          pairings: null,
          lists: null,
        },
      }),
    });
    renderWithProviders(<EventPage eventId="EVT1" />);

    expect(
      await screen.findByText(/The last event sync failed: BCP is unavailable/),
    ).toBeInTheDocument();
  });
});
