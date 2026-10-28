import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aPlayer as samplePlayer } from '../../test/sample-data';
import { PlayersPanel } from './PlayersPanel';

// mantine-datatable decides per-column visibility with `useMediaQuery`, which calls
// `window.matchMedia` once after mount even for columns with no `visibleMediaQuery`. The jsdom
// stub in test/setup.ts always reports no match, which would hide every column shortly after
// mount; report a match here so the table's columns render as they do in a real browser.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
});

/** A sample player with a BCP account (as most have), so their name links to their page. */
const aPlayer = (overrides: Parameters<typeof samplePlayer>[0] = {}) =>
  samplePlayer({ bcpUserId: `US-${overrides.bcpId ?? 'PL-ADA'}`, ...overrides });

/** A team group's collapse toggle (not its "Fetch … lists" button). */
const teamToggle = (team: string) => ({
  name: (_: string, el: Element) =>
    el.getAttribute('aria-expanded') !== null && el.textContent.includes(team),
});

describe('PlayersPanel', () => {
  it('marks a top-ranked player with their rank', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [aPlayer({ bcpId: 'P1', name: 'Zed Zulu', bcpUserId: 'US-ZED' })],
      },
      'GET /api/rankings/top': { ranks: { 'US-ZED': 3 } },
    });
    renderWithRouter(
      <PlayersPanel event={anEventDetail({ isTeamEvent: false })} loadingFromBcp={false} />,
    );
    const badge = await screen.findByRole('link', { name: 'Ranked #3, top 10' });
    expect(badge).toHaveAttribute('href', '/players/US-ZED');
  });

  it('links the name to the player’s page; the row and the list badge open the list', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': { items: [aPlayer({ bcpUserId: 'US-ADA' })] },
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
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);

    expect(await screen.findByRole('link', { name: 'Ada Archer' })).toHaveAttribute(
      'href',
      '/players/US-ADA',
    );
    // The list keeps its own address, for a new tab.
    const listLink = screen.getByRole('link', { name: 'Fetched' });
    expect(listLink).toHaveAttribute('href', '/events/EVT1?tab=players&list=PL-ADA');
    fireEvent.click(listLink);
    expect(await screen.findByText(/Gladius Task Force/)).toBeInTheDocument();
  });

  it('sorts the players on a column header', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({ bcpId: 'P1', name: 'Zed Zulu', placing: 1, faction: 'Orks' }),
          aPlayer({ bcpId: 'P2', name: 'Ada Archer', placing: 2, faction: 'Necrons' }),
        ],
      },
    });
    renderWithRouter(
      <PlayersPanel event={anEventDetail({ isTeamEvent: false })} loadingFromBcp={false} />,
    );
    await screen.findByRole('link', { name: 'Zed Zulu' });
    const names = () =>
      screen
        .getAllByRole('link')
        .map((b) => b.textContent)
        .filter((text) => text === 'Zed Zulu' || text === 'Ada Archer');
    expect(names()).toEqual(['Zed Zulu', 'Ada Archer']);
    // The table's sortable headers are buttons.
    fireEvent.click(screen.getByRole('button', { name: /^Player/ }));
    expect(names()).toEqual(['Ada Archer', 'Zed Zulu']);
    fireEvent.click(screen.getByRole('button', { name: /^#/ }));
    expect(names()).toEqual(['Zed Zulu', 'Ada Archer']);
  });

  it('sorts W-L-D like standings: most wins, then draws, then fewest losses', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({ bcpId: 'P1', name: 'Three Oh', placing: 1, wins: 3, losses: 0, draws: 0 }),
          aPlayer({ bcpId: 'P2', name: 'Four One', placing: 2, wins: 4, losses: 1, draws: 0 }),
          aPlayer({ bcpId: 'P3', name: 'Five Oh', placing: 3, wins: 5, losses: 0, draws: 0 }),
          aPlayer({ bcpId: 'P4', name: 'Four Draw', placing: 4, wins: 4, losses: 0, draws: 1 }),
          aPlayer({ bcpId: 'P5', name: 'No Games', placing: 5, wins: 0, losses: 0, draws: 0 }),
        ],
      },
    });
    renderWithRouter(
      <PlayersPanel event={anEventDetail({ isTeamEvent: false })} loadingFromBcp={false} />,
    );
    await screen.findByRole('link', { name: 'Three Oh' });
    const names = () =>
      screen
        .getAllByRole('link')
        .map((b) => b.textContent)
        .filter((text) =>
          ['Three Oh', 'Four One', 'Five Oh', 'Four Draw', 'No Games'].includes(text),
        );
    fireEvent.click(screen.getByRole('button', { name: /^W-L-D/ }));
    expect(names()).toEqual(['Five Oh', 'Four Draw', 'Four One', 'Three Oh', 'No Games']);
    // No games is no record: last either way.
    fireEvent.click(screen.getByRole('button', { name: /^W-L-D/ }));
    expect(names().at(-1)).toBe('No Games');
  });

  it('shows how strong each player’s opponents here were, sortable', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({
            bcpId: 'P1',
            name: 'Soft Draw',
            placing: 1,
            opponents: { winRate: 0.3, elo: 1480, rated: 4, games: 5 },
          }),
          aPlayer({
            bcpId: 'P2',
            name: 'Hard Road',
            placing: 2,
            opponents: { winRate: 0.66, elo: 1712, rated: 5, games: 5 },
          }),
          aPlayer({ bcpId: 'P3', name: 'No Pairings', placing: 3 }),
        ],
      },
    });
    renderWithRouter(
      <PlayersPanel event={anEventDetail({ isTeamEvent: false })} loadingFromBcp={false} />,
    );
    const hard = (await screen.findByRole('link', { name: 'Hard Road' })).closest('tr');
    if (hard === null) throw new Error('no row');
    // Tougher draws get hotter colours: 60/65/70% and 1650/1700/1750 Elo; easy ones are dimmed.
    expect(within(hard).getByText('66%')).toHaveAttribute('data-draw', 'tough-2');
    expect(within(hard).getByText('1712')).toHaveAttribute('data-draw', 'tough-2');
    const soft = screen.getByRole('link', { name: 'Soft Draw' }).closest('tr');
    if (soft === null) throw new Error('no row');
    expect(within(soft).getByText('30%')).toHaveAttribute('data-draw', 'easy');
    expect(within(soft).getByText('1480')).toHaveAttribute('data-draw', 'easy');
    const none = screen.getByRole('link', { name: 'No Pairings' }).closest('tr');
    if (none === null) throw new Error('no row');
    expect(within(none).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    const names = () =>
      screen
        .getAllByRole('link')
        .map((b) => b.textContent)
        .filter((text) => ['Soft Draw', 'Hard Road', 'No Pairings'].includes(text));
    fireEvent.click(screen.getByRole('button', { name: /^Opp\. Elo/ }));
    expect(names()).toEqual(['Hard Road', 'Soft Draw', 'No Pairings']);
    fireEvent.click(screen.getByRole('button', { name: /^Opp\. win/ }));
    expect(names()).toEqual(['Hard Road', 'Soft Draw', 'No Pairings']);
  });

  it('grades tough draws in three steps', async () => {
    const at = (bcpId: string, winRate: number, elo: number) =>
      aPlayer({ bcpId, name: bcpId, opponents: { winRate, elo, rated: 5, games: 5 } });
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [at('P60', 0.6, 1650), at('P70', 0.7, 1750), at('P59', 0.59, 1649)],
      },
    });
    renderWithRouter(
      <PlayersPanel event={anEventDetail({ isTeamEvent: false })} loadingFromBcp={false} />,
    );
    const row = async (name: string) => {
      const tr = (await screen.findByRole('link', { name })).closest('tr');
      if (tr === null) throw new Error('no row');
      return within(tr);
    };
    expect((await row('P60')).getByText('60%')).toHaveAttribute('data-draw', 'tough-1');
    expect((await row('P60')).getByText('1650')).toHaveAttribute('data-draw', 'tough-1');
    expect((await row('P70')).getByText('70%')).toHaveAttribute('data-draw', 'tough-3');
    expect((await row('P70')).getByText('1750')).toHaveAttribute('data-draw', 'tough-3');
    expect((await row('P59')).getByText('59%')).toHaveAttribute('data-draw', 'even');
    expect((await row('P59')).getByText('1649')).toHaveAttribute('data-draw', 'even');
  });

  it('opens the list the address names, and reports the player opened', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [aPlayer(), aPlayer({ bcpId: 'PL-BEN', name: 'Ben Brass', listStatus: 'none' })],
      },
      'GET /api/players/PL-ADA/list': {
        playerId: 'PL-ADA',
        playerName: 'Ada Archer',
        teamName: null,
        faction: 'Space Marines',
        listId: 'LS-ADA',
        text: 'Shared list text',
        fetchedAt: '2026-09-23T10:00:00.000Z',
      },
    });
    const onOpenPlayer = vi.fn();
    renderWithRouter(
      <PlayersPanel
        event={anEventDetail()}
        loadingFromBcp={false}
        openPlayerId="PL-ADA"
        onOpenPlayer={onOpenPlayer}
      />,
    );
    expect(await screen.findByText('Shared list text')).toBeInTheDocument();
    // Anywhere on the row but the name (that's the player's page) opens their list.
    const ben = screen.getByRole('link', { name: 'Ben Brass' }).closest('tr');
    fireEvent.click(ben?.querySelector('td') as Element);
    expect(onOpenPlayer).toHaveBeenCalledWith('PL-BEN');
  });

  it('names faction, detachments, disposition and record under the player too, for phones', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({
            detachments: ['Gladius Task Force'],
            disposition: 'Take and Hold',
            wins: 3,
            losses: 1,
          }),
        ],
      },
    });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);
    await screen.findByRole('link', { name: 'Ada Archer' });
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent === 'Space Marines · Gladius Task Force · Take and Hold · 3-1-0',
      ),
    ).toBeInTheDocument();
  });

  it('groups a team event’s players by team, collapsibly', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({
            bcpId: 'P1',
            name: 'Ada Archer',
            teamId: 'TM-ALPHA',
            teamName: 'Alpha Squad',
            teamPlacing: 2,
          }),
          aPlayer({
            bcpId: 'P2',
            name: 'Cara Cole',
            teamId: 'TM-CHARLIE',
            teamName: 'Charlie Wing',
            teamPlacing: 1,
          }),
        ],
      },
    });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);
    const charlie = await screen.findByRole('button', teamToggle('Charlie Wing'));
    const alpha = screen.getByRole('button', teamToggle('Alpha Squad'));
    expect(charlie.compareDocumentPosition(alpha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(charlie).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(charlie);
    expect(charlie).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows a team’s placing before its name in the group header, or “—” without one', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({
            bcpId: 'P1',
            name: 'Ada Archer',
            teamId: 'TM-ALPHA',
            teamName: 'Alpha Squad',
            teamPlacing: 2,
          }),
          aPlayer({
            bcpId: 'P2',
            name: 'Cara Cole',
            teamId: 'TM-CHARLIE',
            teamName: 'Charlie Wing',
            teamPlacing: null,
          }),
          aPlayer({
            bcpId: 'P3',
            name: 'Nyx None',
            teamId: null,
            teamName: null,
            teamPlacing: null,
          }),
        ],
      },
    });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);

    const alpha = await screen.findByRole('button', {
      name: (_, el) => el.textContent.startsWith('#2') && el.textContent.includes('Alpha Squad'),
    });
    expect(alpha).toBeInTheDocument();

    const charlie = screen.getByRole('button', {
      name: (_, el) => el.textContent.startsWith('—') && el.textContent.includes('Charlie Wing'),
    });
    expect(charlie).toBeInTheDocument();

    const noTeam = screen.getByRole('button', {
      name: (_, el) => el.textContent.startsWith('No team'),
    });
    expect(noTeam).toBeInTheDocument();
  });

  it('shows a Disposition column, "—" when unset, and a disposition filter', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({ bcpId: 'P1', name: 'Ada Archer', disposition: 'Take and Hold' }),
          aPlayer({ bcpId: 'P2', name: 'Cara Cole', disposition: 'Disruption' }),
          aPlayer({ bcpId: 'P3', name: 'Nyx None', disposition: null }),
        ],
      },
    });
    renderWithRouter(
      <PlayersPanel event={anEventDetail({ isTeamEvent: false })} loadingFromBcp={false} />,
    );

    const adaRow = (await screen.findByText('Ada Archer')).closest('tr');
    const caraRow = screen.getByText('Cara Cole').closest('tr');
    // In the Disposition column and in the phone line (one of them hidden by CSS in a browser).
    expect(adaRow && within(adaRow).getAllByText('Take and Hold')).toHaveLength(2);
    expect(caraRow && within(caraRow).getAllByText('Disruption')).toHaveLength(2);

    const dispositionFilter = screen.getByRole('combobox', { name: 'Disposition' });
    expect(dispositionFilter).toHaveAttribute('placeholder', 'All dispositions');

    fireEvent.click(dispositionFilter);
    const option = await screen.findByRole('option', { name: 'Disruption' });
    fireEvent.click(option);

    expect(await screen.findByText('Cara Cole')).toBeInTheDocument();
    expect(screen.queryByText('Ada Archer')).not.toBeInTheDocument();

    // A multi-select: a second disposition (the dropdown stays open) widens the filter again.
    fireEvent.click(await screen.findByRole('option', { name: 'Take and Hold' }));
    expect(await screen.findByText('Ada Archer')).toBeInTheDocument();
    expect(screen.getByText('Cara Cole')).toBeInTheDocument();
    expect(screen.queryByText('Nyx None')).not.toBeInTheDocument();
  });

  it('shows a Detachment column, a detachment filter, and ⚠ on a guessed army', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({ bcpId: 'P1', name: 'Ada Archer', detachments: ['Kult of Speed', 'Wreckas'] }),
          aPlayer({
            bcpId: 'P2',
            name: 'Cara Cole',
            faction: 'Necrons',
            factionGuessed: true,
            detachments: ['Hypercrypt Legion'],
          }),
          aPlayer({ bcpId: 'P3', name: 'Nyx None', detachments: [] }),
        ],
      },
    });
    renderWithRouter(
      <PlayersPanel event={anEventDetail({ isTeamEvent: false })} loadingFromBcp={false} />,
    );

    const adaRow = (await screen.findByText('Ada Archer')).closest('tr');
    expect(adaRow && within(adaRow).getByText('Kult of Speed + Wreckas')).toBeInTheDocument();
    const caraRow = screen.getByText('Cara Cole').closest('tr');
    // In the Faction column and in the phone line (one of them hidden by CSS in a browser).
    expect(caraRow && within(caraRow).getAllByLabelText('Guessed from the list')).toHaveLength(2);

    fireEvent.click(screen.getByRole('combobox', { name: 'Detachment' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Hypercrypt Legion' }));
    expect(await screen.findByText('Cara Cole')).toBeInTheDocument();
    expect(screen.queryByText('Ada Archer')).not.toBeInTheDocument();
    expect(screen.queryByText('Nyx None')).not.toBeInTheDocument();
  });

  it('shows the no-players message for a team event with no players yet', async () => {
    stubFetchRoutes({ 'GET /api/events/EVT1/players': { items: [] } });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);
    expect(
      await screen.findByText('No players loaded yet. Use "Refresh from BCP".'),
    ).toBeInTheDocument();
  });

  it('shows the no-match message for a team event whose filter matches nothing', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [aPlayer({ bcpId: 'P1', name: 'Ada Archer', teamId: 'TM-ALPHA' })],
      },
    });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);
    await screen.findByRole('button', teamToggle('Alpha Squad'));
    fireEvent.change(screen.getByLabelText('Search players'), {
      target: { value: 'nobody matches this' },
    });
    expect(await screen.findByText('No players match the filter.')).toBeInTheDocument();
  });

  it('shows the loading message for a team event while loading from BCP', async () => {
    stubFetchRoutes({ 'GET /api/events/EVT1/players': { items: [] } });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp />);
    expect(await screen.findByText('Loading players from BCP…')).toBeInTheDocument();
  });

  it('links each team group header to its team page, but not the "No team" group', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/players': {
        items: [
          aPlayer({
            bcpId: 'P1',
            name: 'Ada Archer',
            teamId: 'TM-ALPHA',
            teamName: 'Alpha Squad',
            teamPlacing: 2,
          }),
          aPlayer({
            bcpId: 'P2',
            name: 'Nyx None',
            teamId: null,
            teamName: null,
            teamPlacing: null,
          }),
        ],
      },
    });
    renderWithRouter(<PlayersPanel event={anEventDetail()} loadingFromBcp={false} />);
    const teamLink = await screen.findByRole('link', { name: 'Alpha Squad team page' });
    expect(teamLink).toHaveAttribute('href', '/events/EVT1/teams/TM-ALPHA');
    expect(screen.queryByRole('link', { name: /No team team page/ })).not.toBeInTheDocument();
  });

  it('lets you tick teams and fetch one team’s lists; ticks survive a refetch', async () => {
    const alpha = (overrides: Parameters<typeof aPlayer>[0] = {}) =>
      aPlayer({ teamId: 'TM-ALPHA', teamName: 'Alpha Squad', teamPlacing: 2, ...overrides });
    const players = {
      items: [
        alpha({ bcpId: 'P1', name: 'Ada Archer', listStatus: 'available' }),
        alpha({ bcpId: 'P2', name: 'Ben Baker', listStatus: 'available' }),
        aPlayer({ bcpId: 'P3', name: 'Nyx None', teamId: null, teamName: null, teamPlacing: null }),
      ],
    };
    const fetchMock = stubFetchRoutes({
      'GET /api/events/EVT1/players': players,
      'POST /api/events/EVT1/lists/queue': {
        queued: 2,
        alreadyQueued: 0,
        alreadyFetched: 0,
        noListOnBcp: 0,
        notQualifying: 0,
        estimatedSeconds: 10,
      },
    });
    const { queryClient } = renderWithRouter(
      <PlayersPanel event={anEventDetail()} loadingFromBcp={false} />,
    );

    const tick = await screen.findByRole('checkbox', { name: 'Select Alpha Squad' });
    expect(screen.queryByRole('checkbox', { name: /Select No team/ })).not.toBeInTheDocument();
    // The tick box and the button sit beside the header toggle, not inside it.
    const toggle = screen.getByRole('button', teamToggle('Alpha Squad'));
    expect(toggle.contains(tick)).toBe(false);

    fireEvent.click(tick);
    expect(tick).toBeChecked();
    await queryClient.refetchQueries({ queryKey: ['event', 'EVT1', 'players'] });
    expect(screen.getByRole('checkbox', { name: 'Select Alpha Squad' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Alpha Squad lists' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/events/EVT1/lists/queue')).toBe(
        true,
      );
    });
    const post = fetchMock.mock.calls.find(([url]) => url === '/api/events/EVT1/lists/queue');
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the body is a JSON string here
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ teamIds: ['TM-ALPHA'] });
  });
});
