import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ListQueueState } from '@bcp/shared';
import { listQueueQuery } from '../list-queue/list-queue-queries';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aPlayer, anEventDetail } from '../../test/sample-data';
import { ListDrawer } from './ListDrawer';

const running: ListQueueState = {
  paused: false,
  pausedReason: null,
  pausedUntil: null,
  intervalMs: 5000,
  totals: { queued: 3, fetching: 0, failed: 0 },
  estimatedSeconds: 15,
};

/** Stubs the event (with its lists' estimate) and the queue state the queued status reads. */
function stubQueue(listQueueSeconds: number | null, state: ListQueueState = running) {
  return stubFetchRoutes({
    'GET /api/events/EVT1': anEventDetail({ bcpId: 'EVT1', listQueueSeconds }),
    'GET /api/list-queue': state,
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
      },
    });
    const { queryClient } = renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'available' })} onClose={vi.fn()} />,
    );
    queryClient.setQueryData(listQueueQuery.queryKey, running);
    fireEvent.click(screen.getByRole('button', { name: 'Fetch this list' }));
    await waitFor(() => {
      expect(queryClient.getQueryState(listQueueQuery.queryKey)?.isInvalidated).toBe(true);
    });
  });

  it('estimates when a queued list arrives from the event’s queue estimate', async () => {
    stubQueue(15);
    renderQueued();
    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === 'P' && el.textContent === "Queued · about 15 s for this event's lists.",
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
    expect(await screen.findByText('Queued · the list queue is paused.')).toBeInTheDocument();
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
