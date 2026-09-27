import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { FactionTable } from './FactionTable';
import { necrons, orks, tiny, unknown } from './meta-test-data';

const props = {
  rows: [orks, necrons, tiny, unknown],
  minPlayers: 5,
  sort: 'players' as const,
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

  it('colours win rates: green above 55%, red below 45%', () => {
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
    expect(onSortChange).toHaveBeenCalledWith('winRate');
    const toggle = within(rowOf('Orks')).getByRole('button', { name: 'Show Orks detachments' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith('Orks');
    rerender(<FactionTable {...props} expanded={['Orks']} />);
    expect(screen.getByText('Kult of Speed + Wreckas')).toBeInTheDocument();
    expect(screen.getByText('Detachment unknown')).toBeInTheDocument();
  });

  it('opens the players behind a row', () => {
    const onOpenPlayers = vi.fn();
    renderWithProviders(
      <FactionTable {...props} onOpenPlayers={onOpenPlayers} expanded={['Orks']} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '20 Orks players' }));
    expect(onOpenPlayers).toHaveBeenCalledWith({ faction: 'Orks', detachments: undefined });
    fireEvent.click(screen.getByRole('button', { name: '8 Orks · Detachment unknown players' }));
    expect(onOpenPlayers).toHaveBeenCalledWith({ faction: 'Orks', detachments: null });
  });
});
