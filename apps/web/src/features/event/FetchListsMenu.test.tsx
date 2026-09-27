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
      <FetchListsMenu
        event={anEventDetail({ roundCount: 2, isTeamEvent: false })}
        players={players}
      />,
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
      <FetchListsMenu
        event={anEventDetail({ roundCount: 2, isTeamEvent: false })}
        players={players}
      />,
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
        event={anEventDetail({ roundCount: 2, isTeamEvent: false })}
        players={[aPlayer({ wins: 0, losses: 2, draws: 0, listStatus: 'available' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
    expect(screen.getByRole('menuitem', { name: 'X-0 only (0)' })).toBeDisabled();
  });

  describe('on team events', () => {
    const teamPlayers = [
      aPlayer({ bcpId: 'A', teamId: 'T1', listStatus: 'available' }),
      aPlayer({ bcpId: 'B', teamId: 'T1', listStatus: 'available' }),
      aPlayer({ bcpId: 'C', teamId: 'T2', listStatus: 'available' }),
      aPlayer({ bcpId: 'D', teamId: 'T3', listStatus: 'fetched' }),
    ];

    it('offers all missing lists and the selected teams instead of result filters', () => {
      renderWithProviders(
        <FetchListsMenu
          event={anEventDetail({ roundCount: 5 })}
          players={teamPlayers}
          selectedTeamIds={['T1', 'T2']}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
      expect(screen.getByRole('menuitem', { name: 'All missing lists (3)' })).toBeEnabled();
      expect(
        screen.getByRole('menuitem', { name: 'Selected teams (2 teams · 3 lists)' }),
      ).toBeEnabled();
      expect(screen.queryByRole('menuitem', { name: /X-/ })).toBeNull();
    });

    it('disables Selected teams when none is ticked, and queues the ticked teams', async () => {
      const { unmount } = renderWithProviders(
        <FetchListsMenu event={anEventDetail({ roundCount: 5 })} players={teamPlayers} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
      expect(
        screen.getByRole('menuitem', { name: 'Selected teams (0 teams · 0 lists)' }),
      ).toBeDisabled();
      unmount();

      const fetchMock = stubFetchRoutes({
        'POST /api/events/EVT1/lists/queue': {
          queued: 2,
          alreadyQueued: 0,
          alreadyFetched: 0,
          noListOnBcp: 0,
          notQualifying: 0,
          estimatedSeconds: 10,
        },
      });
      renderWithProviders(
        <FetchListsMenu
          event={anEventDetail({ roundCount: 5 })}
          players={teamPlayers}
          selectedTeamIds={['T1']}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Selected teams (1 team · 2 lists)' }));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ teamIds: ['T1'] });
    });
  });

  describe('top N', () => {
    /** `count` singles players placed 1..count, each with a list to fetch. */
    const field = (count: number, placed = true) =>
      Array.from({ length: count }, (_, i) =>
        aPlayer({
          bcpId: `P${i + 1}`,
          placing: placed ? i + 1 : null,
          teamId: null,
          teamName: null,
          listStatus: i % 2 === 0 ? 'available' : 'fetched',
        }),
      );

    it('offers Top 8 and Top 16 for a 24-player event, with the lists each would fetch', async () => {
      const fetchMock = stubFetchRoutes({
        'POST /api/events/EVT1/lists/queue': {
          queued: 4,
          alreadyQueued: 0,
          alreadyFetched: 0,
          noListOnBcp: 0,
          notQualifying: 0,
          estimatedSeconds: 20,
        },
      });
      renderWithProviders(
        <FetchListsMenu
          event={anEventDetail({ roundCount: 5, isTeamEvent: false })}
          players={field(24)}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
      expect(screen.getByRole('menuitem', { name: 'Top 8 (4)' })).toBeEnabled();
      expect(screen.getByRole('menuitem', { name: 'Top 16 (8)' })).toBeEnabled();
      expect(screen.queryByRole('menuitem', { name: /Top 32/ })).toBeNull();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Top 8 (4)' }));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ topPlacings: 8 });
    });

    it('greys the options out while there are no placings yet', () => {
      renderWithProviders(
        <FetchListsMenu
          event={anEventDetail({ roundCount: 5, isTeamEvent: false })}
          players={field(24, false)}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
      expect(screen.getByRole('menuitem', { name: /Top 8/ })).toBeDisabled();
      expect(screen.getByText('No placings yet')).toBeInTheDocument();
    });

    it('offers Top 4 and Top 8 teams on a team event', async () => {
      const fetchMock = stubFetchRoutes({
        'POST /api/events/EVT1/lists/queue': {
          queued: 2,
          alreadyQueued: 0,
          alreadyFetched: 0,
          noListOnBcp: 0,
          notQualifying: 0,
          estimatedSeconds: 10,
        },
      });
      const teamPlayers = Array.from({ length: 10 }, (_, t) =>
        [0, 1].map((p) =>
          aPlayer({
            bcpId: `T${t}P${p}`,
            teamId: `T${t}`,
            teamName: `Team ${t}`,
            teamPlacing: t + 1,
            listStatus: 'available',
          }),
        ),
      ).flat();
      renderWithProviders(
        <FetchListsMenu
          event={anEventDetail({ roundCount: 5, isTeamEvent: true })}
          players={teamPlayers}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Fetch lists' }));
      expect(screen.getByRole('menuitem', { name: 'Top 8 teams (16)' })).toBeEnabled();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Top 4 teams (8)' }));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ topTeams: 4 });
    });
  });
});
