import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { FactionsPage } from './FactionsPage';
import { metaResponse, necrons, orks, tiny, unknown } from './meta-test-data';

const rowsOf = async () =>
  within(await screen.findByRole('table', { name: 'Factions' }))
    .getAllByRole('row')
    .slice(1);
const nameOf = (row: HTMLElement) => row.querySelector('td')?.textContent;
const cells = (row: HTMLElement | undefined) => {
  if (row === undefined) throw new Error('no row');
  return within(row);
};

describe('FactionsPage', () => {
  it('shows share, players, win rate and reliable win rate, by reliable win rate, Unknown last', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse({ factions: [unknown, orks, necrons, tiny] }),
    });
    renderWithRouter(<FactionsPage search={{}} onSearchChange={vi.fn()} />);
    const rows = await rowsOf();
    // Reliable: Grey Knights 82%, Orks 50%, Necrons 32%.
    expect(rows.map(nameOf)).toEqual(['Grey Knights', 'Orks', 'Necrons', 'Unknown faction']);
    const ork = cells(rows[1]);
    expect(ork.getByText('20%')).toBeInTheDocument();
    expect(ork.getByText('20')).toBeInTheDocument();
    expect(ork.getByText('58%')).toHaveAttribute('data-tone', 'good');
    expect(ork.getByText('50%')).toHaveAttribute('data-tone', 'even');
    expect(cells(rows[0]).getByText('82%')).toHaveAttribute('data-tone', 'good');
    // Small shares keep a decimal; a bar shows each share against the biggest.
    expect(cells(rows[0]).getByText('2.0%')).toBeInTheDocument();
    const bar = rows[1]?.querySelector<HTMLElement>('[data-share-bar]');
    expect(bar?.style.width).toBe('100%');
    expect(rows[2]?.querySelector<HTMLElement>('[data-share-bar]')?.style.width).toBe('50%');
    expect(screen.getByText('100 players · 3 events')).toBeInTheDocument();
  });

  it('sorts by another column on click, Unknown faction still last', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    renderWithRouter(<FactionsPage search={{}} onSearchChange={vi.fn()} />);
    await rowsOf();
    fireEvent.click(screen.getByRole('button', { name: 'Players' }));
    expect((await rowsOf()).map(nameOf)).toEqual([
      'Orks',
      'Necrons',
      'Grey Knights',
      'Unknown faction',
    ]);
  });

  it('opens a faction on the Meta page with the same range and event type', async () => {
    stubFetchRoutes({ 'GET /api/meta': metaResponse() });
    renderWithRouter(
      <FactionsPage
        search={{ from: '2026-06-01', to: '2026-08-31', type: 'singles' }}
        onSearchChange={vi.fn()}
      />,
    );
    const link = await screen.findByRole('link', { name: 'Orks' });
    const href = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(href.pathname).toBe('/analysis/meta');
    expect(Object.fromEntries(href.searchParams)).toEqual({
      factions: 'Orks',
      from: '2026-06-01',
      to: '2026-08-31',
      type: 'singles',
    });
    // No Meta page for the unknown faction's archetypes to open.
    expect(screen.queryByRole('link', { name: 'Unknown faction' })).not.toBeInTheDocument();
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
