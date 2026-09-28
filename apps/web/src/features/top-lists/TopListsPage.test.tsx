import type { PlayerSearchResponse } from '@bcp/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { aPlayer } from '../../test/sample-data';
import { TopListsPage } from './TopListsPage';
import { topListsParams } from './top-lists-queries';

const response = (overrides: Partial<PlayerSearchResponse> = {}): PlayerSearchResponse => ({
  players: [
    {
      ...aPlayer({
        bcpId: 'PL-ADA',
        name: 'Ada Archer',
        faction: 'Orks',
        factionGuessed: true,
        detachments: ['War Horde'],
        disposition: 'Reconnaissance',
        wins: 4,
        losses: 1,
        draws: 0,
      }),
      eventId: 'EVT1',
      eventName: 'Sample Team Open',
      eventStartDate: '2026-03-28T09:00:00.000Z',
    },
  ],
  truncated: false,
  factionOptions: ['Necrons', 'Orks'],
  detachmentOptions: ['War Horde'],
  eventsInRange: 3,
  eventsLoaded: 1,
  ...overrides,
});

describe('topListsParams', () => {
  it('sends only what is set', () => {
    expect(topListsParams({ factions: 'Orks,Necrons', maxLosses: 0 })).toBe(
      'factions=Orks%2CNecrons&maxLosses=0',
    );
    expect(topListsParams({})).toBe('');
    expect(topListsParams({ detachments: 'A, B|C' })).toBe('detachments=A%2C+B%7CC');
  });
});

describe('TopListsPage', () => {
  it('lists qualifying players with event, record and army line, and opens a list', async () => {
    stubFetchRoutes({
      'GET /api/players/search': response(),
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: null,
        faction: 'Orks',
        listId: 'LS-ADA',
        text: 'Orks list text',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
      'GET /api/events/EVT1': {},
      'GET /api/fetch-queue': {},
    });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    const row = (await screen.findByText('Ada Archer')).closest('tr');
    if (row === null) throw new Error('no row');
    expect(within(row).getByText('4-1-0')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Sample Team Open' })).toHaveAttribute(
      'href',
      '/events/EVT1?tab=players',
    );
    expect(within(row).getByText(/War Horde/)).toBeInTheDocument();
    expect(within(row).getByLabelText('Guessed from the list')).toBeInTheDocument();
    expect(screen.getByText(/2 big events in this range aren’t loaded yet/)).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'List' }));
    expect(await screen.findByText('Orks list text')).toBeInTheDocument();
  });

  it('opens a list from anywhere on its row', async () => {
    stubFetchRoutes({
      'GET /api/players/search': response(),
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: null,
        faction: 'Orks',
        listId: 'LS-ADA',
        text: 'Orks list text',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    fireEvent.click(await screen.findByText('4-1-0'));
    expect(await screen.findByText('Orks list text')).toBeInTheDocument();
  });

  it('shows the queued state after "Fetch this list", from the refreshed results', async () => {
    let status: 'available' | 'queued' = 'available';
    const base = response();
    stubFetchRoutes({
      'GET /api/players/search': () =>
        Response.json({
          ...base,
          players: base.players.map((p) => ({ ...p, listStatus: status })),
        }),
      'POST /api/events/EVT1/lists/queue': () => {
        status = 'queued';
        return Response.json({
          queued: 1,
          alreadyQueued: 0,
          alreadyFetched: 0,
          noListOnBcp: 0,
          notQualifying: 0,
          estimatedSeconds: 5,
        });
      },
      'GET /api/events/EVT1': {},
      'GET /api/fetch-queue': {},
    });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    const row = (await screen.findByText('Ada Archer')).closest('tr');
    if (row === null) throw new Error('no row');
    fireEvent.click(within(row).getByRole('button', { name: 'List' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fetch this list' }));
    expect(await screen.findByText(/Queued/)).toBeInTheDocument();
  });

  it('says when results were cut off, and when nothing matches', async () => {
    stubFetchRoutes({ 'GET /api/players/search': response({ truncated: true }) });
    const { unmount } = renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    expect(await screen.findByText(/Showing the first 500/)).toBeInTheDocument();
    unmount();

    stubFetchRoutes({
      'GET /api/players/search': response({ players: [], eventsInRange: 0, eventsLoaded: 0 }),
    });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    expect(
      await screen.findByText(
        'No players match. Try more losses, other factions or a wider range.',
      ),
    ).toBeInTheDocument();
  });

  it('offers every faction the API found, even while one is chosen', async () => {
    stubFetchRoutes({ 'GET /api/players/search': response() });
    renderWithRouter(<TopListsPage search={{ factions: 'Orks' }} onSearchChange={vi.fn()} />);
    await screen.findByText('Ada Archer');
    fireEvent.click(screen.getByRole('combobox', { name: 'Factions' }));
    expect(await screen.findByRole('option', { name: 'Necrons' })).toBeInTheDocument();
  });

  it('writes the chosen record limit into the search', async () => {
    stubFetchRoutes({ 'GET /api/players/search': response() });
    const onSearchChange = vi.fn();
    renderWithRouter(
      <TopListsPage search={{ factions: 'Orks' }} onSearchChange={onSearchChange} />,
    );
    await screen.findByText('Ada Archer');
    const [recordInput] = screen.getAllByLabelText('Record');
    if (recordInput === undefined) throw new Error('no Record input');
    fireEvent.click(recordInput);
    fireEvent.click(await screen.findByRole('option', { name: 'X-0 only' }));
    expect(onSearchChange).toHaveBeenCalledWith({ factions: 'Orks', maxLosses: 0 });
  });

  it('shows the API error with a retry', async () => {
    stubFetchRoutes({
      'GET /api/players/search': () =>
        Response.json(
          { error: { code: 'INTERNAL', message: 'Something went wrong' } },
          { status: 500 },
        ),
    });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
