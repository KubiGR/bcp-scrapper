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
      eventPlayerCount: 96,
      eventTeamCount: 12,
      eventFieldElo: 1712,
    },
  ],
  truncated: false,
  factionOptions: ['Necrons', 'Orks'],
  detachmentOptions: ['War Horde'],
  eventsInRange: 3,
  eventsLoaded: 1,
  ...overrides,
});

/** The players' names, in the order their cards show. */
const names = () =>
  screen.getAllByRole('article').map((card) => card.querySelector('p')?.textContent);
const cardOf = (name: string) => {
  const card = screen.getByText(name).closest('article');
  if (card === null) throw new Error(`no card for ${name}`);
  return card;
};
const pickSort = async (label: string) => {
  const [input] = screen.getAllByLabelText('Sort by');
  if (input === undefined) throw new Error('no Sort by input');
  fireEvent.click(input);
  fireEvent.click(await screen.findByRole('option', { name: label }));
};

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
    const row = (await screen.findByText('Ada Archer')).closest('article');
    if (row === null) throw new Error('no row');
    expect(screen.getByRole('heading', { name: /^4-1-0/ })).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Sample Team Open' })).toHaveAttribute(
      'href',
      '/events/EVT1?tab=players',
    );
    expect(within(row).getByText(/War Horde/)).toBeInTheDocument();
    expect(within(row).getByLabelText('Guessed from the list')).toBeInTheDocument();
    expect(screen.getByText(/2 big events in this range aren’t loaded yet/)).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('link', { name: 'List' }));
    expect(await screen.findByText('Orks list text')).toBeInTheDocument();
  });

  it('sorts the results by the order picked', async () => {
    const zed = {
      ...aPlayer({ bcpId: 'PL-ZED', name: 'Zed Zulu', faction: 'Necrons', wins: 5, losses: 0 }),
      eventId: 'EVT2',
      eventName: 'Later Open',
      eventStartDate: '2026-05-01T09:00:00.000Z',
      eventPlayerCount: 96,
      eventTeamCount: 12,
      eventFieldElo: null,
    };
    const base = response();
    stubFetchRoutes({ 'GET /api/players/search': { ...base, players: [zed, ...base.players] } });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    await screen.findByText('Zed Zulu');
    expect(names()).toEqual(['Zed Zulu', 'Ada Archer']);
    await pickSort('Player');
    expect(names()).toEqual(['Ada Archer', 'Zed Zulu']);
    // Out of record order, each card shows its own record.
    expect(within(cardOf('Ada Archer')).getByText('4-1-0')).toBeInTheDocument();
    await pickSort('Best record');
    expect(names()).toEqual(['Zed Zulu', 'Ada Archer']);
  });

  it('starts with the best record first, grouped under each record', async () => {
    const player = (bcpId: string, name: string, wins: number, losses: number) => ({
      ...aPlayer({ bcpId, name, wins, losses, draws: 0 }),
      eventId: 'EVT1',
      eventName: 'Sample Team Open',
      eventStartDate: '2026-03-28T09:00:00.000Z',
      eventPlayerCount: 96,
      eventTeamCount: 12,
      eventFieldElo: null,
    });
    stubFetchRoutes({
      'GET /api/players/search': response({
        players: [
          player('P1', 'Three Oh', 3, 0),
          player('P2', 'Four One', 4, 1),
          player('P3', 'Five Oh', 5, 0),
          player('P4', 'Three One', 3, 1),
        ],
      }),
    });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    await screen.findByText('Three Oh');
    expect(names()).toEqual(['Five Oh', 'Three Oh', 'Four One', 'Three One']);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      '5-0-0Undefeated · 1 player',
      '3-0-0Undefeated · 1 player',
      '4-1-0One loss · 1 player',
      '3-1-0One loss · 1 player',
    ]);
  });

  it('shows each event’s size next to its date, standing out more the bigger it is', async () => {
    stubFetchRoutes({ 'GET /api/players/search': response() });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    const row = (await screen.findByText('Ada Archer')).closest('article');
    if (row === null) throw new Error('no row');
    expect(row.textContent).toMatch(/96 players · 12 teams/);
    expect(within(row).getByText('96 players')).toHaveAttribute('data-size', 'medium');
  });

  it('shows each event’s field Elo next to its size, as the tournament list does', async () => {
    stubFetchRoutes({ 'GET /api/players/search': response() });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    const row = (await screen.findByText('Ada Archer')).closest('article');
    if (row === null) throw new Error('no row');
    expect(within(row).getByText('Elo 1712')).toBeInTheDocument();
  });

  it('marks events played in the last week as new', async () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    const base = response();
    const old = base.players[0];
    if (old === undefined) throw new Error('no player');
    stubFetchRoutes({
      'GET /api/players/search': {
        ...base,
        players: [
          old,
          { ...old, bcpId: 'p-new', name: 'Nia New', eventId: 'e-new', eventStartDate: recent },
        ],
      },
    });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    const newRow = (await screen.findByText('Nia New')).closest('article');
    const oldRow = screen.getByText('Ada Archer').closest('article');
    if (newRow === null || oldRow === null) throw new Error('no row');
    expect(within(newRow).getByRole('img', { name: 'New this week' })).toBeInTheDocument();
    expect(within(oldRow).queryByRole('img', { name: 'New this week' })).toBeNull();
  });

  it('shows where each player placed: their team’s place in a team event, else their own', async () => {
    const solo = {
      ...aPlayer({
        bcpId: 'PL-SOL',
        name: 'Sol Solo',
        teamId: null,
        teamName: null,
        teamPlacing: null,
        placing: 3,
      }),
      eventId: 'EVT2',
      eventName: 'Singles GT',
      eventStartDate: '2026-03-28T09:00:00.000Z',
      eventPlayerCount: 96,
      eventTeamCount: null,
      eventFieldElo: null,
    };
    const base = response();
    stubFetchRoutes({ 'GET /api/players/search': { ...base, players: [...base.players, solo] } });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    // Beside the event, before its date.
    const eventText = async (event: string) =>
      (await screen.findAllByText(event))[0]?.closest('div')?.textContent;
    expect(await eventText('Singles GT')).toMatch(/^Singles GT#3 · Mar 28, 2026/);
    expect(await eventText('Sample Team Open')).toContain('Alpha Squad · #2 · ');
  });

  it('makes each List a link, to open several in new tabs', async () => {
    stubFetchRoutes({ 'GET /api/players/search': response() });
    renderWithRouter(<TopListsPage search={{}} onSearchChange={vi.fn()} />);
    const row = (await screen.findByText('Ada Archer')).closest('article');
    if (row === null) throw new Error('no row');
    expect(within(row).getByRole('link', { name: 'List' })).toHaveAttribute(
      'href',
      '/events/EVT1?tab=players&list=PL-ADA',
    );
  });

  it('opens a list from anywhere on its card', async () => {
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
    await screen.findByText('Ada Archer');
    fireEvent.click(cardOf('Ada Archer'));
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
    const row = (await screen.findByText('Ada Archer')).closest('article');
    if (row === null) throw new Error('no row');
    fireEvent.click(within(row).getByRole('link', { name: 'List' }));
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

  it('asks for events of at least 4 rounds by default, and writes another choice', async () => {
    const urls: string[] = [];
    stubFetchRoutes({
      'GET /api/players/search': (url: string) => {
        urls.push(url);
        return Response.json(response());
      },
    });
    const onSearchChange = vi.fn();
    renderWithRouter(<TopListsPage search={{}} onSearchChange={onSearchChange} />);
    await screen.findByText('Ada Archer');
    expect(urls[0]).toContain('minRounds=4');
    const [roundsInput] = screen.getAllByLabelText('Min rounds');
    if (roundsInput === undefined) throw new Error('no Min rounds input');
    fireEvent.click(roundsInput);
    fireEvent.click(await screen.findByRole('option', { name: 'Any' }));
    expect(onSearchChange).toHaveBeenCalledWith({ minRounds: 1 });
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
