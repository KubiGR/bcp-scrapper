import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { pickOption } from '../../test/pick-option';
import { FactionTable, MetaSortSelect } from './FactionTable';
import { necrons, orks, tiny, unknown } from './meta-test-data';

const props = {
  rows: [orks, necrons, tiny, unknown],
  minPlayers: 5,
  weeks: [] as string[],
  sort: 'players' as const,
  dir: 'desc' as const,
  expanded: [] as string[],
  onToggle: vi.fn(),
  onOpenPlayers: vi.fn(),
};
/** The cards' first lines (faction or detachment names), in order. */
const cardNames = () =>
  [...document.querySelectorAll('article')].map((card) => card.querySelector('p')?.textContent);
const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('article');
  if (row === null) throw new Error(`no card ${name}`);
  return row;
};

describe('FactionTable', () => {
  it('shows players, share, win rate and X-1 per faction, Unknown faction last', () => {
    renderWithProviders(<FactionTable {...props} />);
    const row = within(rowOf('Orks'));
    expect(row.getByRole('button', { name: '20 Orks players' })).toBeInTheDocument();
    expect(row.getByText('20%')).toBeInTheDocument();
    expect(row.getByText('58%')).toBeInTheDocument();
    expect(row.getByText('6 · 30%')).toBeInTheDocument();
    expect(cardNames().at(-1)).toBe('Unknown faction');
  });

  it('shows over-representation among X-1 players, blue over, orange under, and sorts by it', () => {
    renderWithProviders(
      <FactionTable
        {...props}
        rows={[{ ...orks, overrep: 1.4 }, { ...necrons, overrep: 0.62 }, tiny, unknown]}
        sort="overrep"
      />,
    );
    expect(within(rowOf('Orks')).getByText('1.40×')).toHaveAttribute('data-tone', 'good');
    expect(within(rowOf('Necrons')).getByText('0.62×')).toHaveAttribute('data-tone', 'bad');
    expect(cardNames().slice(0, 2)).toEqual(['Orks', 'Necrons']);
  });

  it('puts a bigger icon by each faction’s name', () => {
    renderWithProviders(<FactionTable {...props} />);
    const img = rowOf('Orks').querySelector('img');
    expect(img).toHaveAttribute('src', '/factions/orks.png');
    expect(img).toHaveAttribute('width', '28');
  });

  it('dims factions below the minimum and sorts them after the rest', () => {
    renderWithProviders(<FactionTable {...props} sort="winRate" />);
    expect(rowOf('Grey Knights')).toHaveAttribute('data-dimmed', 'true');
    const order = cardNames().map((name) => name ?? '');
    expect(order.findIndex((t) => t.includes('Orks'))).toBeLessThan(
      order.findIndex((t) => t.includes('Grey Knights')),
    );
    expect(order.findIndex((t) => t.includes('Orks'))).toBeLessThan(
      order.findIndex((t) => t.includes('Necrons')),
    );
  });

  it('sorts low to high when asked', () => {
    renderWithProviders(<FactionTable {...props} sort="winRate" dir="asc" />);
    const order = cardNames().map((name) => name ?? '');
    expect(order.findIndex((t) => t.includes('Necrons'))).toBeLessThan(
      order.findIndex((t) => t.includes('Orks')),
    );
  });

  it('shows the weekly trend and the change in win rate over the last 30 days', () => {
    renderWithProviders(<FactionTable {...props} weeks={['2026-09-14', '2026-09-21']} />);
    const orksRow = within(rowOf('Orks'));
    expect(orksRow.getByText('+5.0 pp')).toHaveAttribute('data-tone', 'good');
    expect(orksRow.getByRole('img', { name: 'Share by week: 18.0% to 20.0%' })).toBeInTheDocument();
    expect(within(rowOf('Necrons')).getByText('–')).toHaveAttribute(
      'title',
      'Fewer than 30 games in one of the two 30-day spans',
    );
  });

  it('colours win rates: blue above 55%, orange below 45%', () => {
    renderWithProviders(<FactionTable {...props} />);
    expect(within(rowOf('Orks')).getByText('58%')).toHaveAttribute('data-tone', 'good');
    expect(within(rowOf('Necrons')).getByText('40%')).toHaveAttribute('data-tone', 'bad');
  });

  it('colours the reliable win rate: blue from 50%, orange below 45%', () => {
    renderWithProviders(
      <FactionTable
        {...props}
        rows={[
          { ...orks, winRate: 0.6, games: 1000 },
          { ...necrons, winRate: 0.4, games: 1000 },
        ]}
      />,
    );
    expect(within(rowOf('Orks')).getByText('50%')).toHaveAttribute('data-tone', 'good');
    expect(within(rowOf('Necrons')).getByText('32%')).toHaveAttribute('data-tone', 'bad');
  });

  it('expands a faction into its archetypes', () => {
    const onToggle = vi.fn();
    const { rerender } = renderWithProviders(<FactionTable {...props} onToggle={onToggle} />);
    const toggle = within(rowOf('Orks')).getByRole('button', { name: 'Show Orks detachments' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith('Orks');
    rerender(<FactionTable {...props} expanded={['Orks']} />);
    expect(screen.getByText('Kult of Speed + Wreckas')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, el) =>
          el?.getAttribute('data-dispositions') !== null &&
          el?.textContent === 'Take and Hold 75% · Purge the Foe 25%',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Detachment unknown or not in English')).toBeInTheDocument();
  });

  it('opens the players behind a row', () => {
    const onOpenPlayers = vi.fn();
    renderWithProviders(
      <FactionTable {...props} onOpenPlayers={onOpenPlayers} expanded={['Orks']} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '20 Orks players' }));
    expect(onOpenPlayers).toHaveBeenCalledWith({ faction: 'Orks', detachments: undefined });
    fireEvent.click(
      screen.getByRole('button', { name: '8 Orks · Detachment unknown or not in English players' }),
    );
    expect(onOpenPlayers).toHaveBeenCalledWith({ faction: 'Orks', detachments: null });
  });

  it('sorts and dims detachment rows like faction rows', () => {
    const faction = {
      ...orks,
      archetypes: [
        {
          detachments: ['A'],
          dispositions: [],
          players: 12,
          share: 0.12,
          games: 60,
          winRate: 0.4,
          reliableWinRate: 0.32,
          trend: [],
          change: null,
          x1: 1,
          x1Share: 0.1,
          overrep: 1,
          eventWins: 0,
        },
        {
          detachments: ['B'],
          dispositions: [],
          players: 11,
          share: 0.11,
          games: 50,
          winRate: 0.7,
          reliableWinRate: 0.62,
          trend: [],
          change: null,
          x1: 5,
          x1Share: 0.5,
          overrep: 1,
          eventWins: 0,
        },
        {
          detachments: ['C'],
          dispositions: [],
          players: 2,
          share: 0.02,
          games: 10,
          winRate: 0.9,
          reliableWinRate: 0.82,
          trend: [],
          change: null,
          x1: 2,
          x1Share: 1,
          overrep: 1,
          eventWins: 0,
        },
        {
          detachments: null,
          dispositions: [],
          players: 30,
          share: 0.3,
          games: 150,
          winRate: 0.5,
          reliableWinRate: 0.42,
          trend: [],
          change: null,
          x1: 3,
          x1Share: 0.1,
          overrep: 1,
          eventWins: 0,
        },
      ],
    };
    renderWithProviders(
      <FactionTable
        {...props}
        rows={[faction]}
        sort="winRate"
        expanded={['Orks']}
        minPlayers={10}
      />,
    );
    expect(cardNames().slice(1)).toEqual(['B', 'A', 'C', 'Detachment unknown or not in English']);
    expect(rowOf('C')).toHaveAttribute('data-dimmed', 'true');
  });

  it('offers the orders in a menu; the default clears the sort from the address', async () => {
    const onSortChange = vi.fn();
    const { rerender } = renderWithProviders(
      <MetaSortSelect sort="reliable" onSortChange={onSortChange} />,
    );
    await pickOption('Sort by', 'Players');
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'players', dir: 'desc' });
    await pickOption('Sort by', 'Name A–Z');
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'faction', dir: 'asc' });
    rerender(<MetaSortSelect sort="players" onSortChange={onSortChange} />);
    await pickOption('Sort by', 'Reliable win rate');
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });
});
