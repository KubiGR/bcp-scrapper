import type { FactionMatrix as FactionMatrixData } from '@bcp/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { FactionMatrix } from './FactionMatrix';
import { DEFAULT_MATRIX_SETTINGS } from './matrix-view';

const matrix = (): FactionMatrixData => ({
  factions: ['Orks', 'Necrons'],
  games: 16,
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
    {
      row: 'Necrons',
      col: 'Orks',
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winRate: 0.5,
      avgPoints: 10,
    },
    {
      row: 'Orks',
      col: 'Orks',
      games: 4,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      avgPoints: null,
    },
    {
      row: 'Necrons',
      col: 'Necrons',
      games: 6,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      avgPoints: null,
    },
  ],
});

describe('FactionMatrix', () => {
  it('renders row and column headers and a cell text with its tone', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Orks' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Necrons' })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Orks vs Necrons/ });
    expect(button.textContent).toContain('50%');
    expect(button.textContent).toContain('3');
  });

  it('hides a cell under minGames as plain, unclickable text', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 5 }}
        onCell={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Orks vs Necrons/ })).toBeNull();
    expect(screen.getAllByText('·').length).toBeGreaterThan(0);
  });

  it('shows only the halved count on a mirror cell (each mirror game adds two sides)', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    const mirror = screen.getByRole('button', { name: /Orks vs Orks/ });
    expect(mirror.textContent).toBe('2');
  });

  it('shows a caption explaining the axes', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Rows: faction · Columns: opponent · Cell: row faction's result"),
    ).toBeInTheDocument();
  });

  it('gives a cell an aria-label without duplicating the value and game count', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Orks vs Necrons: 50% win rate over 3 games' }),
    ).toBeInTheDocument();
  });

  it('calls onCell when a cell is clicked', () => {
    const onCell = vi.fn();
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={onCell}
      />,
    );
    screen.getByRole('button', { name: /Orks vs Necrons/ }).click();
    expect(onCell).toHaveBeenCalledWith({ row: 'Orks', col: 'Necrons' });
  });

  it('marks the column header row and row-header column as sticky', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    const columnHeader = screen.getByRole('columnheader', { name: 'Orks' });
    expect(columnHeader.className).toMatch(/stickyHeader/);
    const rowHeader = screen.getByRole('rowheader', { name: 'Necrons' });
    expect(rowHeader.className).toMatch(/stickyRowHeader/);
  });

  it('marks the top-left corner cell as sticky on both axes', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    const corner = document.querySelector('[data-testid="matrix-corner"]');
    expect(corner?.className).toMatch(/corner/);
  });

  it('gives a stronger win rate a stronger background than a weaker one', () => {
    const strongMatrix: FactionMatrixData = {
      factions: ['Orks', 'Necrons'],
      games: 6,
      cells: [
        {
          row: 'Orks',
          col: 'Necrons',
          games: 3,
          wins: 3,
          draws: 0,
          losses: 0,
          winRate: 0.85,
          avgPoints: 18,
        },
        {
          row: 'Necrons',
          col: 'Orks',
          games: 3,
          wins: 1,
          draws: 1,
          losses: 1,
          winRate: 0.55,
          avgPoints: 10,
        },
      ],
    };
    renderWithProviders(
      <FactionMatrix
        matrix={strongMatrix}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    const strongCell = screen
      .getByRole('button', { name: /Orks vs Necrons/ })
      .closest('td') as HTMLElement;
    const weakCell = screen
      .getByRole('button', { name: /Necrons vs Orks/ })
      .closest('td') as HTMLElement;
    expect(strongCell.style.getPropertyValue('--strength')).not.toBe(
      weakCell.style.getPropertyValue('--strength'),
    );
    expect(Number(strongCell.style.getPropertyValue('--strength'))).toBeGreaterThan(
      Number(weakCell.style.getPropertyValue('--strength')),
    );
  });
});
