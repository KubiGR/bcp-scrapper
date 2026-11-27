import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '../../routeTree.gen';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aPlayer, anEventDetail, aSyncRun } from '../../test/sample-data';
import { EventPage } from './EventPage';

const tabProps = { tab: 'players', onTabChange: () => undefined } as const;

describe('EventPage', () => {
  it('restores a filtered roster from its URL and keeps those filters when opening a list', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': { authRequired: false, user: null },
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({
            name: 'Ada Archer',
            faction: 'Tyranids',
            disposition: 'Take and Hold',
            detachments: ['Invasion Fleet'],
          }),
          aPlayer({ bcpId: 'PL-BEN', name: 'Ben Brass', faction: 'Aeldari' }),
        ],
      },
      'GET /api/events/EVT1': anEventDetail({ isTeamEvent: false }),
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: null,
        faction: 'Tyranids',
        listId: 'LS-ADA',
        text: 'Example army list',
        fetchedAt: '2026-11-27T10:00:00Z',
      },
    });
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({
        initialEntries: [
          '/events/EVT1?faction=Tyranids&disposition=Take%20and%20Hold&detachment=Invasion%20Fleet&maxLosses=0&sort=elo',
        ],
      }),
    });
    renderWithProviders(<RouterProvider router={router} />);
    expect(await screen.findByText('1 of 2 players')).toBeInTheDocument();
    expect(screen.queryByText('Ben Brass')).not.toBeInTheDocument();
    const input = screen.getAllByRole('textbox', { name: 'Search players' })[0];
    if (!input) throw new Error('Missing player search input');
    fireEvent.change(input, { target: { value: 'Ada Archer' } });
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ q: 'Ada Archer' });
    });

    const link = screen.getByRole('link', { name: 'Fetched' });
    expect(link).toHaveAttribute('href', expect.stringContaining('faction=Tyranids'));
    fireEvent.click(link);
    expect(await screen.findByText('Example army list')).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({
      tab: 'players',
      list: 'PL-ADA',
      q: 'Ada Archer',
      faction: 'Tyranids',
      disposition: 'Take and Hold',
      detachment: 'Invasion Fleet',
      maxLosses: 0,
      sort: 'elo',
    });
  });

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
