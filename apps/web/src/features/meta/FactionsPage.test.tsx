import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { FactionsPage } from './FactionsPage';
import { metaResponse, necrons, orks, tiny, unknown } from './meta-test-data';

const tableRows = async () =>
  within(await screen.findByRole('table', { name: 'Factions' }))
    .getAllByRole('row')
    .slice(1);
/** The faction rows, without the tier headings. */
const rowsOf = async () => (await tableRows()).filter((row) => row.dataset.faction !== undefined);
const nameOf = (row: HTMLElement) => row.dataset.faction;
const cells = (row: HTMLElement | undefined) => {
  if (row === undefined) throw new Error('no row');
  return within(row);
};

describe('FactionsPage', () => {
  it('groups factions by win-rate tier, with too few players last, without the Unknown faction', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse({ factions: [unknown, orks, necrons, tiny] }),
    });
    renderWithRouter(<FactionsPage search={{}} onSearchChange={vi.fn()} />);
    const rows = await tableRows();
    expect(rows.map((row) => row.dataset.faction ?? row.textContent)).toEqual([
      'SDominant55%+1 faction',
      'Orks',
      'DWeakunder 46%1 faction',
      'Necrons',
      '–Too few playersunder 10 players1 faction',
      'Grey Knights',
    ]);
    const ork = cells(rows[1]);
    expect(ork.getByText('20 players · 20% share · 100 games')).toBeInTheDocument();
    expect(ork.getByText('58.0%')).toBeInTheDocument();
    expect(ork.getByLabelText('2 event wins')).toBeInTheDocument();
    expect(ork.getByText('50%')).toHaveAttribute('data-tone', 'good');
    expect(ork.getByText('S')).toHaveAttribute('data-tier', 'S');
    // The bar fills from even (50%) towards 58% on a 35–65% track.
    const fill = rows[1]?.querySelector<HTMLElement>('[data-rate-fill]');
    expect(fill?.style.left).toBe('50%');
    expect(parseFloat(fill?.style.width ?? '')).toBeCloseTo(26.67, 1);
    expect(rows[5]).toHaveAttribute('data-dimmed', 'true');
    expect(screen.getByText('100 players · 3 events')).toBeInTheDocument();
  });

  it('ranks factions flat by reliable win rate, numbered', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse({ factions: [unknown, orks, necrons, tiny] }),
    });
    renderWithRouter(<FactionsPage search={{ layout: 'flat' }} onSearchChange={vi.fn()} />);
    const rows = await tableRows();
    // Reliable: Grey Knights 82%, Orks 50%, Necrons 32%.
    expect(rows.map(nameOf)).toEqual(['Grey Knights', 'Orks', 'Necrons']);
    expect(rows.map((row) => row.querySelector('td')?.textContent)).toEqual(['1', '2', '3']);
  });

  it('switches layout in the search', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    const onSearchChange = vi.fn();
    renderWithRouter(<FactionsPage search={{}} onSearchChange={onSearchChange} />);
    await rowsOf();
    fireEvent.click(screen.getByRole('radio', { name: 'Flat ranking' }));
    expect(onSearchChange).toHaveBeenCalledWith({ layout: 'flat' });
  });

  it('shows over-representation among X-1 players, and sorts on it', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse({
        factions: [
          { ...orks, overrep: 1.4 },
          { ...necrons, overrep: 0.62 },
          { ...tiny, overrep: 1.1 },
        ],
      }),
    });
    renderWithRouter(<FactionsPage search={{ layout: 'flat' }} onSearchChange={vi.fn()} />);
    const rows = await rowsOf();
    const ork = cells(rows.find((row) => nameOf(row) === 'Orks'));
    expect(ork.getByText('1.40×')).toHaveAttribute('data-tone', 'good');
    fireEvent.click(screen.getByRole('button', { name: /Overrep/ }));
    expect((await rowsOf()).map(nameOf)).toEqual(['Orks', 'Grey Knights', 'Necrons']);
  });

  it('sorts within each tier by another column on click', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse({
        factions: [
          { ...orks, faction: 'Orks', winRate: 0.6, eventWins: 1 },
          { ...orks, faction: 'Custodes', winRate: 0.56, eventWins: 4 },
          necrons,
        ],
      }),
    });
    renderWithRouter(<FactionsPage search={{}} onSearchChange={vi.fn()} />);
    expect((await rowsOf()).map(nameOf)).toEqual(['Orks', 'Custodes', 'Necrons']);
    fireEvent.click(screen.getByRole('button', { name: 'Wins' }));
    expect((await rowsOf()).map(nameOf)).toEqual(['Custodes', 'Orks', 'Necrons']);
  });

  it('leaves out event wins at team events, which don’t count them', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    renderWithRouter(<FactionsPage search={{ type: 'teams' }} onSearchChange={vi.fn()} />);
    await rowsOf();
    expect(screen.queryByRole('button', { name: 'Wins' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('2 event wins')).not.toBeInTheDocument();
  });

  it('puts the three best win rates on a podium, with their change', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse({
        factions: [necrons, tiny, orks, { ...necrons, faction: 'Tau', winRate: 0.45 }, unknown],
      }),
    });
    renderWithRouter(<FactionsPage search={{}} onSearchChange={vi.fn()} />);
    const podium = await screen.findByRole('region', { name: 'Podium' });
    const places = [...podium.querySelectorAll<HTMLElement>('[data-podium]')];
    // Grey Knights has too few players; the Unknown faction isn't one.
    expect(places.map((place) => place.dataset.podium)).toEqual(['Orks', 'Tau', 'Necrons']);
    const first = cells(places[0]);
    expect(first.getByText('#1')).toBeInTheDocument();
    expect(first.getByText('58.0%')).toBeInTheDocument();
    expect(first.getByText('+5.0 pp')).toHaveAttribute('data-tone', 'good');
  });

  it('lists risers and fallers against the update before the latest', async () => {
    const update = (id: string, start: string, name: string) => ({
      id,
      name,
      autoName: name,
      start,
      autoStart: start,
      merged: false,
      hidden: false,
      events: 4,
      summary: '',
      suggestions: [name],
    });
    const fetchMock = stubFetchRoutes({
      'GET /api/meta': metaResponse({
        factions: [
          orks,
          { ...necrons, change: -0.031 },
          { ...necrons, faction: 'Tau', change: 0.01 },
          { ...tiny, change: 0.3 },
        ],
      }),
      'GET /api/updates': {
        updates: [
          update('b', '2026-09-30', 'MFM 1.5'),
          update('a', '2026-07-22', 'Summer 2026 Faction Packs'),
        ],
      },
    });
    renderWithRouter(
      <FactionsPage search={{ from: '2026-08-01', to: '2026-10-03' }} onSearchChange={vi.fn()} />,
    );
    expect(await screen.findByText('MFM 1.5 vs Summer 2026 Faction Packs')).toBeInTheDocument();
    expect(JSON.stringify(fetchMock.mock.calls)).toContain(
      'recentFrom=2026-09-30&recentTo=2026-10-03&priorFrom=2026-07-22&priorTo=2026-09-29',
    );
    const moves = (name: string) =>
      [...screen.getByRole('region', { name }).querySelectorAll<HTMLElement>('[data-move]')].map(
        (row) => row.dataset.move,
      );
    // Grey Knights moved most, but with too few players.
    expect(moves('Risers')).toEqual(['Orks', 'Tau']);
    expect(moves('Fallers')).toEqual(['Necrons']);
    expect(
      within(screen.getByRole('region', { name: 'Fallers' })).getByText('−3.1 pp'),
    ).toHaveAttribute('data-tone', 'bad');
  });

  it('finds factions by name', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    renderWithRouter(<FactionsPage search={{}} onSearchChange={vi.fn()} />);
    await rowsOf();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search factions' }), {
      target: { value: 'nec' },
    });
    expect((await rowsOf()).map(nameOf)).toEqual(['Necrons']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search factions' }), {
      target: { value: 'zzz' },
    });
    expect(await screen.findByText('No faction matches “zzz”.')).toBeInTheDocument();
  });

  it('opens a faction on the Meta page with the same range and event type', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    renderWithRouter(
      <FactionsPage
        search={{ from: '2026-06-01', to: '2026-08-31', type: 'singles', layout: 'flat' }}
        onSearchChange={vi.fn()}
      />,
    );
    const table = await screen.findByRole('table', { name: 'Factions' });
    const link = within(table).getByRole('link', { name: 'Orks' });
    const href = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(href.pathname).toBe('/analysis/meta');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      factions: 'Orks',
      from: '2026-06-01',
      to: '2026-08-31',
      type: 'singles',
    });
  });

  it('keeps the event type in the search', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    const onSearchChange = vi.fn();
    renderWithRouter(<FactionsPage search={{}} onSearchChange={onSearchChange} />);
    await rowsOf();
    fireEvent.click(screen.getByRole('radio', { name: 'Teams' }));
    expect(onSearchChange).toHaveBeenCalledWith({ type: 'teams' });
  });

  it('says when the range has no big events', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse({ factions: [], eventsInRange: 0, eventsLoaded: 0 }),
    });
    renderWithRouter(<FactionsPage search={{}} onSearchChange={vi.fn()} />);
    expect(await screen.findByText('No big events in this range.')).toBeInTheDocument();
  });
});
