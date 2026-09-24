import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { aPlayer } from '../../test/sample-data';
import { ListDrawer } from './ListDrawer';

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

  it('shows a queued list as on its way, and a failed one with its reason and Retry', () => {
    const { unmount } = renderWithProviders(
      <ListDrawer eventId="EVT1" player={aPlayer({ listStatus: 'queued' })} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/queued/i)).toBeInTheDocument();
    unmount();
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
