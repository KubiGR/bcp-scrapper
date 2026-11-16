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
  reliableWinRate: 0.82,
  trend: [],
  change: null,
  x1: 2,
  x1Share: 1,
  overrep: 1,
  eventWins: 0,
  archetypes: [
    {
      detachments: ['Teleport Strike Force'],
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
  ],
};

/** A faction with one archetype. */
const single = (
  faction: string,
  detachment: string,
  players: number,
  winRate: number,
  reliableWinRate = winRate,
): MetaRow => {
  const figures = {
    players,
    share: players / 1000,
    games: players * 5,
    winRate,
    reliableWinRate,
    trend: [],
    change: null,
    x1: 0,
    x1Share: 0,
    overrep: 1,
    eventWins: 0,
  };
  return {
    faction,
    ...figures,
    archetypes: [{ detachments: [detachment], dispositions: [], ...figures }],
  };
};

const props = {
  rows: [orks, necrons, greyKnights],
  minPlayers: 5,
  weeks: [] as string[],
  sort: 'winRate' as const,
  dir: 'desc' as const,
  factions: [] as string[],
  onOpenPlayers: vi.fn(),
};
const rowOf = (detachments: string) => {
  const row = screen.getByText(detachments).closest('article');
  if (row === null) throw new Error(`no card ${detachments}`);
  return row;
};
const order = () =>
  [...document.querySelectorAll('article')].map((card) => card.querySelector('p')?.textContent);

describe('ArchetypeTable', () => {
  it('lists every faction’s archetypes as cards, with their faction and figures', () => {
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

  it('puts the faction’s icon, big, left of each archetype', () => {
    renderWithProviders(<ArchetypeTable {...props} />);
    const img = rowOf('Kult of Speed + Wreckas').querySelector('img');
    expect(img).toHaveAttribute('src', '/factions/orks.png');
    expect(img).toHaveAttribute('width', '36');
  });

  it('shows which dispositions an archetype’s players picked', () => {
    renderWithProviders(<ArchetypeTable {...props} />);
    const row = rowOf('Kult of Speed + Wreckas');
    expect(
      within(row).getByText(
        (_, el) =>
          el?.getAttribute('data-dispositions') !== null &&
          el?.textContent === 'Take and Hold 75% · Purge the Foe 25%',
      ),
    ).toBeInTheDocument();
  });

  it('leaves out players without a known detachment, and says how many', () => {
    renderWithProviders(<ArchetypeTable {...props} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
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

  it('sorts by the reliable win rate, so a big solid archetype beats a small lucky one', () => {
    renderWithProviders(
      <ArchetypeTable
        {...props}
        rows={[
          single('Orks', 'Small Lucky', 12, 0.71, 0.52),
          single('Necrons', 'Big Solid', 200, 0.6, 0.57),
        ]}
        minPlayers={1}
        sort="reliable"
      />,
    );
    expect(order()).toEqual(['Big Solid', 'Small Lucky']);
    expect(within(rowOf('Small Lucky')).getByText('52%')).toBeInTheDocument();
  });
  it('sorts by change in win rate, with rows without one last either way', () => {
    const { rerender } = renderWithProviders(<ArchetypeTable {...props} sort="change" />);
    // Kult of Speed + Wreckas fell 3 points; the others have too few games to tell.
    expect(within(rowOf('Kult of Speed + Wreckas')).getByText('−3.0 pp')).toHaveAttribute(
      'data-tone',
      'bad',
    );
    expect(order()[0]).toBe('Kult of Speed + Wreckas');
    rerender(<ArchetypeTable {...props} sort="change" dir="asc" />);
    expect(order()[0]).toBe('Kult of Speed + Wreckas');
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
