import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FetchQueueState } from '@bcp/shared';
import { fetchQueueQuery } from '../fetch-queue/fetch-queue-queries';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aPlayer, anEventDetail, listJobTotals } from '../../test/sample-data';
import { ListDrawer } from './ListDrawer';

const running: FetchQueueState = {
  paused: false,
  pausedReason: null,
  pausedUntil: null,
  intervalMs: 5000,
  totals: listJobTotals({ queued: 3, fetching: 0, failed: 0 }),
  estimatedSeconds: 15,
  auto: { enabled: false, jobs: 0, events: 0 },
};

/** Stubs the event (with its lists' estimate) and the queue state the queued status reads. */
function stubQueue(queueSeconds: number | null, state: FetchQueueState = running) {
  return stubFetchRoutes({
    'GET /api/events/EVT1': anEventDetail({ bcpId: 'EVT1', queueSeconds }),
    'GET /api/fetch-queue': state,
  });
}

const renderQueued = (listStatus: 'queued' | 'fetching' = 'queued') =>
  renderWithProviders(
    <ListDrawer eventId="EVT1" player={aPlayer({ listStatus })} onClose={vi.fn()} />,
  );

describe('ListDrawer', () => {
  it('shows a fetched list with a copy button', async () => {
    stubFetchRoutes({
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: 'Alpha Squad',
        faction: 'Space Marines',
        listId: 'LS-ADA',
        text: 'Space Marines – Gladius Task Force\n\nCaptain (80 pts)',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    renderWithProviders(<ListDrawer eventId="EVT1" player={aPlayer()} onClose={vi.fn()} />);
    expect(await screen.findByText(/Gladius Task Force/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy list' })).toBeInTheDocument();
  });

  it('copies a link that opens this list on its event page', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    stubFetchRoutes({});
    renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'none' })} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share list' }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/events/EVT1?tab=players&list=PL-ADA`,
    );
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('shares the link through the phone’s share sheet when there is one', () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    stubFetchRoutes({});
    renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'none' })} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share list' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Ada Archer’s list',
      url: `${window.location.origin}/events/EVT1?tab=players&list=PL-ADA`,
    });
    Reflect.deleteProperty(navigator, 'share');
  });

  it('copies the list and opens 40kCompactor in a new tab', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    stubFetchRoutes({
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: null,
        faction: 'Space Marines',
        listId: 'LS-ADA',
        text: 'Space Marines list text',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    renderWithProviders(<ListDrawer eventId="EVT1" player={aPlayer()} onClose={vi.fn()} />);
    const link = await screen.findByRole('link', { name: /Compact on 40kCompactor/ });
    // The desktop version: the site sends touch/narrow screens to a mobile version that 404s.
    expect(link).toHaveAttribute('href', 'https://desjani.github.io/40kCompactor/?ui=desktop');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    fireEvent.click(link);
    expect(writeText).toHaveBeenCalledWith('Space Marines list text');
    expect(
      await screen.findByText('List copied: paste it into 40kCompactor, then press Compact.'),
    ).toBeInTheDocument();
  });

  it('explains a list that was never submitted', () => {
    renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'none' })} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/didn't submit a list/)).toBeInTheDocument();
  });

  it('queues a single list that is not fetched yet', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/events/EVT1/lists/queue': {
        queued: 1,
        alreadyQueued: 0,
        alreadyFetched: 0,
        noListOnBcp: 0,
        notQualifying: 0,
        estimatedSeconds: 5,
        auto: { enabled: false, jobs: 0, events: 0 },
      },
    });
    renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'available' })} onClose={vi.fn()} />,
    );
    expect(screen.getByText("This list hasn't been fetched yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch this list' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      playerIds: ['PL-ADA'],
    });
  });

  it('refreshes the queue state after queueing a single list', async () => {
    stubFetchRoutes({
      'POST /api/events/EVT1/lists/queue': {
        queued: 1,
        alreadyQueued: 0,
        alreadyFetched: 0,
        noListOnBcp: 0,
        notQualifying: 0,
        estimatedSeconds: 5,
        auto: { enabled: false, jobs: 0, events: 0 },
      },
    });
    const { queryClient } = renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'available' })} onClose={vi.fn()} />,
    );
    queryClient.setQueryData(fetchQueueQuery.queryKey, running);
    fireEvent.click(screen.getByRole('button', { name: 'Fetch this list' }));
    await waitFor(() => {
      expect(queryClient.getQueryState(fetchQueueQuery.queryKey)?.isInvalidated).toBe(true);
    });
  });

  it('estimates when a queued list arrives from the event’s queue estimate', async () => {
    stubQueue(15);
    renderQueued();
    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === 'P' && el.textContent === "Queued · about 15 s for this event's queue.",
      ),
    ).toBeInTheDocument();
  });

  it('says a queued list has no estimate yet, or that the queue is paused', async () => {
    stubQueue(null);
    const { unmount } = renderQueued();
    expect(await screen.findByText('Queued.')).toBeInTheDocument();
    unmount();

    stubQueue(15, { ...running, paused: true, pausedReason: 'user' });
    renderQueued();
    expect(await screen.findByText('Queued · the fetch queue is paused.')).toBeInTheDocument();
  });

  it('says a list mid-fetch is being fetched even once the queue is paused', async () => {
    stubQueue(15, { ...running, paused: true, pausedReason: 'user' });
    renderQueued('fetching');
    // The fetch under way finishes; pausing only stops the next ones.
    await waitFor(() => {
      expect(screen.getByText('Fetching this list…')).toBeInTheDocument();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/paused/)).not.toBeInTheDocument();
  });

  it('shows a list being fetched', async () => {
    stubQueue(15);
    renderQueued('fetching');
    expect(await screen.findByText('Fetching this list…')).toBeInTheDocument();
    expect(screen.getByText('Fetching this list…')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows a failed list with its reason and Retry', () => {
    renderWithProviders(
      <ListDrawer
        eventId="EVT1"
        player={aPlayer({ listStatus: 'failed', listError: 'BCP hiccup' })}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('BCP hiccup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
