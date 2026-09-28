import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { PairingsGate } from './PairingsGate';

const pairings = {
  syncedAt: null,
  roundCount: 3,
  roundsDone: 0,
  queued: 0,
  queuedRounds: 0,
  failed: 0,
  failedRounds: [] as number[],
  loadFailed: false,
  gamesAvailable: true,
};
const line = (text: string) =>
  screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text);

describe('PairingsGate', () => {
  it('offers to fetch pairings when there are none, and queues them', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/events/EVT1/pairings/queue': {
        eventQueued: false,
        queuedRounds: 3,
        estimatedSeconds: 15,
      },
    });
    renderWithProviders(
      <PairingsGate event={anEventDetail({ pairings })}>
        <p>content</p>
      </PairingsGate>,
    );
    expect(screen.queryByText('content')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fetch pairings' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/events/EVT1/pairings/queue')).toBe(
        true,
      );
    });
  });

  it('shows progress while fetching, with the content fetched so far', () => {
    renderWithProviders(
      <PairingsGate
        event={anEventDetail({
          pairings: { ...pairings, roundsDone: 1, queued: 2, queuedRounds: 2 },
          queueSeconds: 10,
        })}
      >
        <p>content</p>
      </PairingsGate>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.getAttribute('aria-live') === 'polite' &&
          el.textContent.includes('Pairings · 1/3 rounds · about 10 s'),
      ),
    ).toBeInTheDocument();
  });

  it('offers Retry for failed rounds and says when games are unavailable', async () => {
    const fetchMock = stubFetchRoutes({ 'POST /api/fetch-queue/retry-failed': { requeued: 1 } });
    renderWithProviders(
      <PairingsGate
        event={anEventDetail({
          pairings: {
            ...pairings,
            roundsDone: 2,
            failed: 1,
            failedRounds: [3],
            gamesAvailable: false,
          },
        })}
      >
        <p>content</p>
      </PairingsGate>,
    );
    expect(line('Round 3 failed')).toBeInTheDocument();
    expect(screen.getByText(/Individual games unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      const body = fetchMock.mock.calls[0]?.[1]?.body;
      // Only the pairings: the event's failed lists are retried from the players tab.
      expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual({
        eventId: 'EVT1',
        only: 'pairings',
      });
    });
  });

  it('names several failed rounds, and a failed event load', () => {
    const { rerender } = renderWithProviders(
      <PairingsGate
        event={anEventDetail({
          pairings: { ...pairings, roundsDone: 1, failed: 2, failedRounds: [2, 5] },
        })}
      >
        <p>content</p>
      </PairingsGate>,
    );
    expect(line('Rounds 2 and 5 failed')).toBeInTheDocument();
    rerender(
      <PairingsGate
        event={anEventDetail({ pairings: { ...pairings, failed: 1, loadFailed: true } })}
      >
        <p>content</p>
      </PairingsGate>,
    );
    expect(line('Loading the event from BCP failed')).toBeInTheDocument();
  });

  it('counts the rounds left while refreshing, and says when the event is loading first', () => {
    const { rerender } = renderWithProviders(
      <PairingsGate
        event={anEventDetail({
          pairings: { ...pairings, roundsDone: 3, queued: 2, queuedRounds: 2 },
        })}
      >
        <p>content</p>
      </PairingsGate>,
    );
    expect(line('Refreshing pairings · 2 rounds left')).toBeInTheDocument();
    rerender(
      <PairingsGate event={anEventDetail({ pairings: { ...pairings, queued: 1 } })}>
        <p>content</p>
      </PairingsGate>,
    );
    expect(line('Loading the event from BCP…')).toBeInTheDocument();
  });

  it('says so when BCP has no rounds to fetch', async () => {
    stubFetchRoutes({
      'POST /api/events/EVT1/pairings/queue': {
        eventQueued: false,
        queuedRounds: 0,
        estimatedSeconds: null,
      },
    });
    renderWithProviders(
      <PairingsGate event={anEventDetail({ pairings: { ...pairings, roundCount: 0 } })}>
        <p>content</p>
      </PairingsGate>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fetch pairings' }));
    expect(await screen.findByText('BCP lists no rounds for this event yet.')).toBeInTheDocument();
  });

  it('invalidates the event’s queries once queued pairings settle to 0', () => {
    const { queryClient, rerender } = renderWithProviders(
      <PairingsGate event={anEventDetail({ pairings: { ...pairings, roundsDone: 1, queued: 2 } })}>
        <p>content</p>
      </PairingsGate>,
    );
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    rerender(
      <PairingsGate event={anEventDetail({ pairings: { ...pairings, roundsDone: 3, queued: 0 } })}>
        <p>content</p>
      </PairingsGate>,
    );

    expect(spy).toHaveBeenCalledWith({ queryKey: ['event', 'EVT1'] });
  });
});
