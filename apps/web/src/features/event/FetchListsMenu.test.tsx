import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aPlayer } from '../../test/sample-data';
import { FetchListsMenu } from './FetchListsMenu';

const players = [
  aPlayer({ bcpId: 'A', wins: 2, losses: 0, draws: 0, listStatus: 'available' }),
  aPlayer({ bcpId: 'B', wins: 1, losses: 1, draws: 0, listStatus: 'available' }),
  aPlayer({ bcpId: 'C', wins: 0, losses: 2, draws: 0, listStatus: 'available' }),
];

describe('FetchListsMenu', () => {
  it('offers every missing list and each possible result filter, with counts', () => {
    renderWithProviders(
      <FetchListsMenu event={anEventDetail({ roundCount: 2 })} players={players} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
    expect(screen.getByRole('menuitem', { name: 'All missing lists (3)' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'X-0 only (1)' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'X-1 or better (2)' })).toBeEnabled();
    expect(screen.queryByRole('menuitem', { name: /X-2/ })).toBeNull();
  });

  it('queues the chosen result filter', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/events/EVT1/lists/queue': {
        queued: 2,
        alreadyQueued: 0,
        alreadyFetched: 0,
        noListOnBcp: 0,
        notQualifying: 1,
        estimatedSeconds: 10,
      },
    });
    renderWithProviders(
      <FetchListsMenu event={anEventDetail({ roundCount: 2 })} players={players} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'X-1 or better (2)' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ maxLosses: 1 });
  });

  it('disables filters with nothing to fetch', () => {
    renderWithProviders(
      <FetchListsMenu
        event={anEventDetail({ roundCount: 2 })}
        players={[aPlayer({ wins: 0, losses: 2, draws: 0, listStatus: 'available' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
    expect(screen.getByRole('menuitem', { name: 'X-0 only (0)' })).toBeDisabled();
  });
});
