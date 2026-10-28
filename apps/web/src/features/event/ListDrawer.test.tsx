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
    // No share sheet on a desktop browser: just the link to copy.
    expect(screen.queryByRole('button', { name: 'Share list' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/events/EVT1?tab=players&list=PL-ADA`,
    );
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('shows the link to copy by hand when the browser allows no copying', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('NotAllowedError')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    stubFetchRoutes({});
    renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'none' })} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByLabelText('Couldn’t copy: select the link and copy it')).toHaveValue(
      `${window.location.origin}/events/EVT1?tab=players&list=PL-ADA`,
    );
  });

  it('shares the link through the phone’s share sheet, and copies it if the sheet fails', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('busy', 'InvalidStateError')));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    stubFetchRoutes({});
    renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'none' })} onClose={vi.fn()} />,
    );
    // Copying stays one tap away beside the share sheet.
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share list' }));
    const url = `${window.location.origin}/events/EVT1?tab=players&list=PL-ADA`;
    expect(share).toHaveBeenCalledWith({ title: 'Ada Archer’s list', url });
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(url);
    Reflect.deleteProperty(navigator, 'share');
  });

  it('does nothing more when the share sheet is closed', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('closed', 'AbortError')));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    stubFetchRoutes({});
    renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'none' })} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share list' }));
    await waitFor(() => {
      expect(share).toHaveBeenCalled();
    });
    expect(writeText).not.toHaveBeenCalled();
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
    // The drawer also looks up the player's games; the queue request is the POST.
    const queued = () => fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    await waitFor(() => {
      expect(queued()).toBeDefined();
    });
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(queued()?.[1]?.body))).toEqual({
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

  it('lists the player’s games in the event: opponent, army, result and who went first', async () => {
    const opponent = {
      id: 'PL-BOB',
      name: 'Bob Bowman',
      faction: 'Necrons',
      factionGuessed: false,
      teamId: null,
      disposition: 'Take and Hold',
      detachments: ['Awakened Dynasty'],
    };
    const ada = { ...opponent, id: 'PL-ADA', name: 'Ada Archer', faction: 'Space Marines' };
    stubFetchRoutes({
      'GET /api/events/EVT1/rounds': {
        gamesAvailable: true,
        rounds: [
          {
            round: 1,
            bracket: false,
            matchups: [],
            games: [
              {
                id: 'G1',
                tableNo: 4,
                playerA: opponent,
                playerB: ada,
                gamePointsA: 40,
                gamePointsB: 100,
                vpA: null,
                vpB: null,
                firstTurn: 'b',
                result: 'b_win',
              },
            ],
          },
        ],
      },
    });
    renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'none' })} onClose={vi.fn()} />,
    );
    const games = await screen.findByRole('region', { name: 'Games' });
    expect(games).toHaveTextContent('R1');
    expect(games).toHaveTextContent('W');
    expect(games).toHaveTextContent('100–40');
    expect(games).toHaveTextContent('Bob Bowman');
    expect(games).toHaveTextContent('Necrons');
    expect(games).toHaveTextContent('Awakened Dynasty');
    expect(games).toHaveTextContent('went first');
  });
});
