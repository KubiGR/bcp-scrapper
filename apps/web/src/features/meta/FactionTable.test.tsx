import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { FactionTable } from './FactionTable';
import { necrons, orks, tiny, unknown } from './meta-test-data';

const props = {
  rows: [orks, necrons, tiny, unknown],
  minPlayers: 5,
  weeks: [] as string[],
  sort: 'players' as const,
  dir: 'desc' as const,
  expanded: [] as string[],
  onSortChange: vi.fn(),
  onToggle: vi.fn(),
  onOpenPlayers: vi.fn(),
};
const rowOf = (name: string) => {
  const row = screen.getByText(name).closest('tr');
  if (row === null) throw new Error(`no row ${name}`);
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
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(names.at(-1)).toContain('Unknown faction');
  });

  it('dims factions below the minimum and sorts them after the rest', () => {
    renderWithProviders(<FactionTable {...props} sort="winRate" />);
    expect(rowOf('Grey Knights')).toHaveAttribute('data-dimmed', 'true');
    const order = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(order.findIndex((t) => t.includes('Orks'))).toBeLessThan(
      order.findIndex((t) => t.includes('Grey Knights')),
    );
    expect(order.findIndex((t) => t.includes('Orks'))).toBeLessThan(
      order.findIndex((t) => t.includes('Necrons')),
    );
  });

  it('flips a sorted column on a second click and turns it off on a third', () => {
    const onSortChange = vi.fn();
    const { rerender } = renderWithProviders(
      <FactionTable {...props} onSortChange={onSortChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Players/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'players', dir: 'asc' });
    rerender(<FactionTable {...props} dir="asc" onSortChange={onSortChange} />);
    expect(screen.getByRole('columnheader', { name: /Players/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    fireEvent.click(screen.getByRole('button', { name: /Players/ }));
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });

  it('sorts low to high, and by faction name A→Z first', () => {
    const onSortChange = vi.fn();
    renderWithProviders(
      <FactionTable {...props} sort="winRate" dir="asc" onSortChange={onSortChange} />,
    );
    const order = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(order.findIndex((t) => t.includes('Necrons'))).toBeLessThan(
      order.findIndex((t) => t.includes('Orks')),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Faction' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'faction', dir: 'asc' });
  });

  it('shows the weekly trend and the change in reliable win rate since the period before', () => {
    renderWithProviders(<FactionTable {...props} weeks={['2026-09-14', '2026-09-21']} />);
    const orksRow = within(rowOf('Orks'));
    expect(orksRow.getByText('+5.0 pp')).toHaveAttribute('data-tone', 'good');
    expect(orksRow.getByRole('img', { name: 'Share by week: 18.0% to 20.0%' })).toBeInTheDocument();
    expect(within(rowOf('Necrons')).getByText('new')).toBeInTheDocument();
  });

  it('colours win rates: blue above 55%, orange below 45%', () => {
    renderWithProviders(<FactionTable {...props} />);
    expect(within(rowOf('Orks')).getByText('58%')).toHaveAttribute('data-tone', 'good');
    expect(within(rowOf('Necrons')).getByText('40%')).toHaveAttribute('data-tone', 'bad');
  });

  it('sorts on a column header and expands a faction into its archetypes', () => {
    const onSortChange = vi.fn();
    const onToggle = vi.fn();
    const { rerender } = renderWithProviders(
      <FactionTable {...props} onSortChange={onSortChange} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Win rate' }));
    expect(onSortChange).toHaveBeenCalledWith({ sort: 'winRate', dir: 'desc' });
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
          reliableBefore: null,
          x1: 1,
          x1Share: 0.1,
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
          reliableBefore: null,
          x1: 5,
          x1Share: 0.5,
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
          reliableBefore: null,
          x1: 2,
          x1Share: 1,
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
          reliableBefore: null,
          x1: 3,
          x1Share: 0.1,
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
    const names = screen
      .getAllByRole('row')
      .slice(2)
      .map((r) => r.querySelector('td')?.textContent);
    expect(names).toEqual(['B', 'A', 'C', 'Detachment unknown or not in English']);
    expect(rowOf('C')).toHaveAttribute('data-dimmed', 'true');
  });

  it('tells screen readers which column is sorted', () => {
    renderWithProviders(<FactionTable {...props} sort="winRate" />);
    expect(screen.getByRole('columnheader', { name: 'Win rate' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: 'Players' })).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });
});
