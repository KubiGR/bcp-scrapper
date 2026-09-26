import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { anEventDetail, aPlayer } from '../../test/sample-data';
import { MatchupsPanel } from './MatchupsPanel';

const matrix = (overrides: Record<string, unknown> = {}) => ({
  matrix: {
    factions: ['Orks', 'Necrons'],
    games: 3,
    cells: [
      {
        row: 'Orks',
        col: 'Necrons',
        games: 3,
        wins: 1,
        draws: 1,
        losses: 1,
        winRate: 0.5,
        avgPoints: 10,
      },
    ],
  },
  scoring: { consistent: true, scale: 20 },
  ...overrides,
});

describe('MatchupsPanel', () => {
  it('shows the summary line and the matrix', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/matchups': matrix(),
      'GET /api/events/EVT1/players': { items: [] },
    });
    renderWithProviders(<MatchupsPanel event={anEventDetail()} />);

    expect(await screen.findByRole('columnheader', { name: 'Orks' })).toBeInTheDocument();
    const summary = await screen.findByText(
      (_, node) => node?.textContent === '3 games · 2 factions',
    );
    expect(summary).toBeInTheDocument();
  });

  it('shows an empty state when there are no games with known factions', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/matchups': matrix({
        matrix: { factions: [], games: 0, cells: [] },
      }),
      'GET /api/events/EVT1/players': { items: [] },
    });
    renderWithProviders(<MatchupsPanel event={anEventDetail()} />);

    expect(await screen.findByText('No games with known factions yet.')).toBeInTheDocument();
  });

  it('disables the Game points option with a reason when scales differ', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/matchups': matrix({ scoring: { consistent: false, scale: null } }),
      'GET /api/events/EVT1/players': { items: [] },
    });
    renderWithProviders(<MatchupsPanel event={anEventDetail()} />);

    expect(await screen.findByRole('radio', { name: 'Game points' })).toBeDisabled();
    expect(screen.getByText('Events use different scoring')).toBeInTheDocument();
  });

  it('refetches with the chosen disposition and row side', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/events/EVT1/matchups': matrix(),
      'GET /api/events/EVT1/players': {
        items: [aPlayer({ disposition: 'Disruption' })],
      },
    });
    renderWithProviders(<MatchupsPanel event={anEventDetail()} />);

    const dispositionFilter = await screen.findByRole('combobox', { name: 'Disposition' });
    fireEvent.click(dispositionFilter);
    const option = await screen.findByRole('option', { name: 'Disruption' });
    fireEvent.click(option);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url]) =>
            typeof url === 'string' &&
            url.includes('/api/events/EVT1/matchups?') &&
            decodeURIComponent(url).includes('dispositions=Disruption') &&
            url.includes('side=row'),
        ),
      ).toBe(true);
    });
  });

  it('shows a Clear filter empty state when a disposition filter matches no games', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/matchups': matrix({
        matrix: { factions: [], games: 0, cells: [] },
      }),
      'GET /api/events/EVT1/players': {
        items: [aPlayer({ disposition: 'Disruption' })],
      },
    });
    renderWithProviders(<MatchupsPanel event={anEventDetail()} />);

    const dispositionFilter = await screen.findByRole('combobox', { name: 'Disposition' });
    fireEvent.click(dispositionFilter);
    const option = await screen.findByRole('option', { name: 'Disruption' });
    fireEvent.click(option);

    expect(await screen.findByText('No games match this disposition filter.')).toBeInTheDocument();
    expect(screen.queryByText('No games with known factions yet.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(await screen.findByText('No games with known factions yet.')).toBeInTheDocument();
  });

  it('keeps showing the matrix, dimmed, while a filter change refetches instead of blanking it', async () => {
    let resolveSecond: (() => void) | undefined;
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    stubFetchRoutes({
      'GET /api/events/EVT1/matchups': (url: string) => {
        if (url.includes('dispositions=')) {
          return second.then(() => Response.json(matrix()));
        }
        return Promise.resolve(Response.json(matrix()));
      },
      'GET /api/events/EVT1/players': {
        items: [aPlayer({ disposition: 'Disruption' })],
      },
    });
    renderWithProviders(<MatchupsPanel event={anEventDetail()} />);

    expect(await screen.findByRole('columnheader', { name: 'Orks' })).toBeInTheDocument();

    const dispositionFilter = await screen.findByRole('combobox', { name: 'Disposition' });
    fireEvent.click(dispositionFilter);
    const option = await screen.findByRole('option', { name: 'Disruption' });
    fireEvent.click(option);

    // While the new (disposition-filtered) query is pending, the old matrix stays mounted and dimmed.
    const columnHeader = await screen.findByRole('columnheader', { name: 'Orks' });
    expect(columnHeader).toBeInTheDocument();
    const dimmedBox = document.querySelector('[aria-busy="true"]');
    expect(dimmedBox).not.toBeNull();

    resolveSecond?.();
    await waitFor(() => {
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    });
  });

  it('opens a drawer with a cell’s games on click', async () => {
    stubFetchRoutes({
      'GET /api/events/EVT1/matchups/games': {
        games: [
          {
            id: 'G1',
            eventId: 'EVT1',
            eventName: 'Sample Team Open',
            round: 1,
            tableNo: 2,
            row: { name: 'Ada Archer', faction: 'Orks', disposition: null, teamName: null },
            col: { name: 'Bea Moss', faction: 'Necrons', disposition: null, teamName: null },
            outcome: 'win',
            rowPoints: 12,
            colPoints: 8,
          },
        ],
      },
      'GET /api/events/EVT1/matchups': matrix(),
      'GET /api/events/EVT1/players': { items: [] },
    });
    renderWithProviders(<MatchupsPanel event={anEventDetail()} />);

    const button = await screen.findByRole('button', { name: /Orks vs Necrons/ });
    fireEvent.click(button);

    expect(await screen.findByText('Ada Archer')).toBeInTheDocument();
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('Bea Moss')).toBeInTheDocument();
  });
});
