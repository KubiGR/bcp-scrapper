import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { PairingsGate } from './PairingsGate';

const pairings = {
  syncedAt: null,
  roundCount: 3,
  roundsDone: 0,
  queued: 0,
  failed: 0,
  gamesAvailable: true,
};

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
          pairings: { ...pairings, roundsDone: 1, queued: 2 },
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
          pairings: { ...pairings, roundsDone: 2, failed: 1, gamesAvailable: false },
        })}
      >
        <p>content</p>
      </PairingsGate>,
    );
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '1 round failed'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Individual games unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      const body = fetchMock.mock.calls[0]?.[1]?.body;
      expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual({ eventId: 'EVT1' });
    });
  });
});
