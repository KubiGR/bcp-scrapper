import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aSyncRun } from '../../test/sample-data';
import { FetchListsButton } from './FetchListsButton';

describe('FetchListsButton', () => {
  it('offers to fetch the missing lists and starts a lists sync', async () => {
    const fetchMock = stubFetchRoutes({ 'POST /api/sync': aSyncRun({ status: 'succeeded' }) });
    renderWithProviders(<FetchListsButton event={anEventDetail()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fetch all lists (7 missing)' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      kind: 'lists',
      eventId: 'EVT1',
    });
  });

  it('explains hidden lists and lists that were unavailable last time', () => {
    renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          hideLists: true,
          counts: { players: 8, teams: 4, listsAvailable: 7, listsFetched: 5 },
          syncs: { event: null, pairings: null, lists: aSyncRun({ done: 5, failed: 2 }) },
        })}
      />,
    );
    expect(screen.getByText(/lists as hidden/)).toBeInTheDocument();
    expect(screen.getByText('2 lists were unavailable on the last fetch.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch all lists (2 missing)' })).toBeEnabled();
  });

  it('is disabled when every list is fetched, or when BCP has none', () => {
    const { unmount } = renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          counts: { players: 8, teams: 4, listsAvailable: 7, listsFetched: 7 },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'All lists fetched' })).toBeDisabled();
    unmount();
    renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          counts: { players: 8, teams: 4, listsAvailable: 0, listsFetched: 0 },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'No lists on BCP' })).toBeDisabled();
  });
});
