import type { MetaRow } from '@bcp/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { ArchetypeTable } from './ArchetypeTable';
import { necrons, orks } from './meta-test-data';

const greyKnights: MetaRow = {
  faction: 'Grey Knights',
  players: 2,
  share: 0.02,
  games: 10,
  winRate: 0.9,
  x1: 2,
  x1Share: 1,
  archetypes: [
    {
      detachments: ['Teleport Strike Force'],
      players: 2,
      share: 0.02,
      games: 10,
      winRate: 0.9,
      x1: 2,
      x1Share: 1,
    },
  ],
};

/** A faction with one archetype. */
const single = (faction: string, detachment: string, players: number, winRate: number): MetaRow => {
  const figures = {
    players,
    share: players / 1000,
    games: players * 5,
    winRate,
    x1: 0,
    x1Share: 0,
  };
  return { faction, ...figures, archetypes: [{ detachments: [detachment], ...figures }] };
};

const props = {
  rows: [orks, necrons, greyKnights],
  totalPlayers: 100,
  grouped: false,
  onGroupedChange: vi.fn(),
  minPlayers: 5,
  sort: 'winRate' as const,
  dir: 'desc' as const,
  factions: [] as string[],
  onSortChange: vi.fn(),
  onFactionsChange: vi.fn(),
  onOpenPlayers: vi.fn(),
};
const rowOf = (detachments: string) => {
  const row = screen.getByText(detachments).closest('tr');
  if (row === null) throw new Error(`no row ${detachments}`);
  return row;
};
const order = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td p')?.textContent);

describe('ArchetypeTable', () => {
  it('lists every faction’s archetypes in one table, with their faction and figures', () => {
    renderWithProviders(<ArchetypeTable {...props} />);
    const ork = within(rowOf('Kult of Speed + Wreckas'));
    expect(ork.getByText('Orks')).toBeInTheDocument();
    expect(ork.getByRole('button', { name: '12 Orks · Kult of Speed + Wreckas players' }));
    expect(ork.getByText('12%')).toBeInTheDocument();
    expect(ork.getByText('60%')).toHaveAttribute('data-tone', 'good');
    expect(within(rowOf('Hypercrypt Legion')).getByText('Necrons')).toBeInTheDocument();
    // Small shares keep a decimal, so rare archetypes don't all read 0%.
    expect(within(rowOf('Teleport Strike Force')).getByText('2.0%')).toBeInTheDocument();
  });

  it('leaves out players without a known detachment, and says how many', () => {
    renderWithProviders(<ArchetypeTable {...props} />);
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(
      screen.getByText('8 players without a known detachment in English aren’t shown.'),
    ).toBeInTheDocument();
  });

  it('sorts by the chosen column, small archetypes dimmed and last', () => {
    const { rerender } = renderWithProviders(<ArchetypeTable {...props} />);
    expect(order()).toEqual([
      'Kult of Speed + Wreckas',
      'Hypercrypt Legion',
      'Teleport Strike Force',
    ]);
    expect(rowOf('Teleport Strike Force')).toHaveAttribute('data-dimmed', 'true');
    rerender(<ArchetypeTable {...props} dir="asc" />);
    expect(order()).toEqual([
      'Hypercrypt Legion',
      'Kult of Speed + Wreckas',
      'Teleport Strike Force',
    ]);
  });

  it('cycles a column header: high to low, low to high, then off', () => {
    const onSortChange = vi.fn();
    const { rerender } = renderWithProviders(
      <ArchetypeTable {...props} onSortChange={onSortChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Players' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'players', dir: 'desc' });
    fireEvent.click(screen.getByRole('button', { name: /Win rate/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'winRate', dir: 'asc' });
    rerender(<ArchetypeTable {...props} dir="asc" onSortChange={onSortChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Win rate/ }));
    expect(onSortChange).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Archetype' }));
    expect(onSortChange).toHaveBeenLastCalledWith({ sort: 'faction', dir: 'asc' });
  });

  it('groups by share of players, most popular first, each sorted by win rate', () => {
    renderWithProviders(
      <ArchetypeTable
        {...props}
        grouped
        totalPlayers={1000}
        rows={[
          single('Orks', 'Rare Hot', 3, 0.9),
          single('Necrons', 'Popular Cold', 15, 0.4),
          single('Aeldari', 'Very Popular', 30, 0.5),
          single('Tau', 'Popular Hot', 12, 0.6),
          single('Custodes', 'Played', 6, 0.55),
        ]}
        minPlayers={1}
      />,
    );
    const lines = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('td p')?.textContent ?? row.textContent);
    expect(lines).toEqual([
      'Very popular · 2%+ of players (20+)',
      'Very Popular',
      'Popular · 1–2% (10–19)',
      'Popular Hot',
      'Popular Cold',
      'Played · 0.5–1% (5–9)',
      'Played',
      'Rare · under 0.5% (under 5)',
      'Rare Hot',
    ]);
  });

  it('hides empty groups, and lists everything together when grouping is off', () => {
    const onGroupedChange = vi.fn();
    const { rerender } = renderWithProviders(
      <ArchetypeTable
        {...props}
        grouped
        onGroupedChange={onGroupedChange}
        totalPlayers={1000}
        rows={[single('Orks', 'Rare Hot', 3, 0.9), single('Aeldari', 'Very Popular', 30, 0.5)]}
        minPlayers={1}
      />,
    );
    expect(screen.queryByText(/^Popular ·/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Group by popularity' }));
    expect(onGroupedChange).toHaveBeenCalledWith(false);
    rerender(
      <ArchetypeTable
        {...props}
        totalPlayers={1000}
        rows={[single('Orks', 'Rare Hot', 3, 0.9), single('Aeldari', 'Very Popular', 30, 0.5)]}
        minPlayers={1}
      />,
    );
    expect(screen.queryByText(/^Rare ·/)).not.toBeInTheDocument();
    expect(order()).toEqual(['Rare Hot', 'Very Popular']);
  });

  it('narrows to the chosen factions', () => {
    renderWithProviders(<ArchetypeTable {...props} factions={['Necrons']} />);
    expect(order()).toEqual(['Hypercrypt Legion']);
    expect(screen.queryByText(/without a known detachment/)).not.toBeInTheDocument();
  });

  it('opens the players of an archetype', () => {
    const onOpenPlayers = vi.fn();
    renderWithProviders(<ArchetypeTable {...props} onOpenPlayers={onOpenPlayers} />);
    fireEvent.click(
      screen.getByRole('button', { name: '12 Orks · Kult of Speed + Wreckas players' }),
    );
    expect(onOpenPlayers).toHaveBeenCalledWith({
      faction: 'Orks',
      detachments: ['Kult of Speed', 'Wreckas'],
    });
  });
});
