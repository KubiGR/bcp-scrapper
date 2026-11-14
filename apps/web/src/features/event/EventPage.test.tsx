import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aSyncRun } from '../../test/sample-data';
import { EventPage } from './EventPage';

const tabProps = { tab: 'players', onTabChange: () => undefined } as const;

describe('EventPage', () => {
  it('offers to fetch an event that is not in the catalogue yet', async () => {
    stubFetchRoutes({
      'GET /api/events/NOPE': () =>
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'Event NOPE is not in the local catalogue' } },
          { status: 404 },
        ),
    });
    renderWithProviders(<EventPage eventId="NOPE" {...tabProps} />);
    expect(await screen.findByText(/isn't in the local catalogue yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch from BCP' })).toBeInTheDocument();
  });

  it('loads a never-synced event from BCP automatically, once', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({
        stale: true,
        lastSyncedAt: null,
        syncs: { event: null },
      }),
      'POST /api/sync': aSyncRun({ kind: 'event', status: 'succeeded' }),
    });
    renderWithProviders(<EventPage eventId="EVT1" {...tabProps} />);

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
        syncs: { event: running },
      }),
      'GET /api/sync-runs/1': running,
    });
    renderWithProviders(<EventPage eventId="EVT1" {...tabProps} />);

    expect(await screen.findByRole('button', { name: 'Refresh from BCP' })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/sync')).toBe(false);
  });

  it('says why the last event sync failed', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({
        syncs: {
          event: aSyncRun({ kind: 'event', status: 'failed', error: 'BCP is unavailable' }),
        },
      }),
    });
    renderWithProviders(<EventPage eventId="EVT1" {...tabProps} />);

    expect(
      await screen.findByText(/The last event sync failed: BCP is unavailable/),
    ).toBeInTheDocument();
  });

  it('says BCP removed the event instead of showing its old sync failure', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({
        removedFromBcpAt: '2026-10-29T10:00:00.000Z',
        syncs: {
          event: aSyncRun({ kind: 'event', status: 'failed', error: 'BCP has nothing here' }),
        },
      }),
    });
    renderWithProviders(<EventPage eventId="EVT1" {...tabProps} />);

    expect(await screen.findByText(/BCP no longer has this event/)).toBeInTheDocument();
    expect(screen.getByText('Removed from BCP')).toBeInTheDocument();
    expect(screen.queryByText(/The last event sync failed/)).toBeNull();
  });

  it('marks a blocked event, hides its old sync failure and offers no Refresh', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({
        blockedAt: '2026-11-14T10:00:00.000Z',
        syncs: {
          event: aSyncRun({ kind: 'event', status: 'failed', error: 'BCP is unavailable' }),
        },
      }),
    });
    renderWithProviders(<EventPage eventId="EVT1" {...tabProps} />);

    expect(await screen.findByText(/An admin blocked this event/)).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.queryByText(/The last event sync failed/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh from BCP' })).toBeNull();
  });

  it('shows Players & lists, Rounds, Standings, Matchups on team events; no Standings on singles', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail(),
    });
    const { unmount } = renderWithProviders(<EventPage eventId="EVT1" {...tabProps} />);
    expect(await screen.findByRole('tab', { name: 'Players & lists' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rounds' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Standings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Matchups' })).toBeInTheDocument();
    unmount();

    stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({ isTeamEvent: false }),
    });
    renderWithProviders(<EventPage eventId="EVT1" {...tabProps} />);
    expect(await screen.findByRole('tab', { name: 'Players & lists' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Rounds' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Matchups' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Standings' })).toBeNull();
  });

  it('falls back to Players & lists on a singles event asked to show a tab it does not have', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [] },
      'GET /api/events/EVT1': anEventDetail({ isTeamEvent: false }),
    });
    renderWithProviders(<EventPage eventId="EVT1" {...tabProps} tab="standings" />);

    const playersTab = await screen.findByRole('tab', { name: 'Players & lists' });
    expect(playersTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Standings' })).toBeNull();
  });
});
