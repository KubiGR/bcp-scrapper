import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, stubFetchRoutes } from '../../test/render';
import { FactionsPage } from './FactionsPage';
import { metaResponse, necrons, orks, tiny, unknown } from './meta-test-data';

const bars = async () =>
  within(await screen.findByRole('list', { name: 'Factions by share of players' })).getAllByRole(
    'listitem',
  );

const at = (items: HTMLElement[], index: number) => {
  const item = items[index];
  if (item === undefined) throw new Error(`no bar ${String(index)}`);
  return within(item);
};

describe('FactionsPage', () => {
  it('shows each faction’s share of players, biggest first, Unknown faction last', async () => {
    stubFetchRoutes({
      'GET /api/meta': metaResponse({ factions: [unknown, tiny, necrons, orks] }),
    });
    renderWithRouter(<FactionsPage search={{}} onSearchChange={vi.fn()} />);
    const items = await bars();
    expect(items.map((item) => item.querySelector('a, [data-name]')?.textContent)).toEqual([
      'Orks',
      'Necrons',
      'Grey Knights',
      'Unknown faction',
    ]);
    const first = at(items, 0);
    expect(first.getByText('20%')).toBeInTheDocument();
    expect(first.getByText('20 players')).toBeInTheDocument();
    expect(first.getByText('58% WR')).toHaveAttribute('data-tone', 'good');
    // Small shares keep a decimal.
    expect(at(items, 2).getByText('2.0%')).toBeInTheDocument();
    expect(screen.getByText('100 players · 3 events')).toBeInTheDocument();
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
    await bars();
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
