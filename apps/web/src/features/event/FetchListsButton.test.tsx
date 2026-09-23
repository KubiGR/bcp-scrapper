import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail } from '../../test/sample-data';
import { FetchListsButton } from './FetchListsButton';

const queueResult = {
  queued: 7,
  alreadyQueued: 0,
  alreadyFetched: 0,
  noListOnBcp: 0,
  notQualifying: 0,
  estimatedSeconds: 35,
};

describe('FetchListsButton', () => {
  it('offers to fetch the missing lists and queues them', async () => {
    const fetchMock = stubFetchRoutes({
      'POST /api/events/EVT1/lists/queue': queueResult,
    });
    renderWithProviders(<FetchListsButton event={anEventDetail()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fetch all lists (7 missing)' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({});
  });

  it('explains hidden lists', () => {
    renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          hideLists: true,
          counts: {
            players: 8,
            teams: 4,
            listsAvailable: 7,
            listsFetched: 5,
            listsMissing: 2,
            listsQueued: 0,
            listsFailed: 0,
          },
        })}
      />,
    );
    expect(screen.getByText(/lists as hidden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch all lists (2 missing)' })).toBeEnabled();
  });

  it('is disabled when every list is fetched, or when BCP has none', () => {
    const { unmount } = renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          counts: {
            players: 8,
            teams: 4,
            listsAvailable: 7,
            listsFetched: 7,
            listsMissing: 0,
            listsQueued: 0,
            listsFailed: 0,
          },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'All lists fetched' })).toBeDisabled();
    unmount();
    renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          counts: {
            players: 8,
            teams: 4,
            listsAvailable: 0,
            listsFetched: 0,
            listsMissing: 0,
            listsQueued: 0,
            listsFailed: 0,
          },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'No lists on BCP' })).toBeDisabled();
  });

  it('labels the button from listsMissing minus listsQueued', () => {
    renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          counts: {
            players: 8,
            teams: 4,
            listsAvailable: 7,
            listsFetched: 7,
            listsMissing: 1,
            listsQueued: 0,
            listsFailed: 0,
          },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Fetch all lists (1 missing)' })).toBeEnabled();
  });

  it('shows "All lists queued" once every missing list is already queued', () => {
    renderWithProviders(
      <FetchListsButton
        event={anEventDetail({
          counts: {
            players: 8,
            teams: 4,
            listsAvailable: 7,
            listsFetched: 0,
            listsMissing: 7,
            listsQueued: 7,
            listsFailed: 0,
          },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'All lists queued' })).toBeDisabled();
  });
});
