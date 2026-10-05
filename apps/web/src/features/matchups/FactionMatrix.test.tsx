import type { DetachmentRowsResponse, FactionMatrix as FactionMatrixData } from '@bcp/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { FactionMatrix } from './FactionMatrix';
import type { DetachmentRowsQuery } from './matchups-queries';
import { DEFAULT_MATRIX_SETTINGS } from './matrix-view';

const matrix = (): FactionMatrixData => ({
  factions: ['Orks', 'Necrons'],
  columns: ['Orks', 'Necrons'],
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

  it('shows every opponent as a column even when fewer factions are rows', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={{ ...matrix(), factions: ['Orks'], columns: ['Necrons', 'Orks'] }}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '',
      'Necrons',
      'Orks',
    ]);
    expect(screen.getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Orks']);
    expect(screen.getByRole('button', { name: /Orks vs Necrons/ })).toBeInTheDocument();
  });

  it('shows a mirror with a win rate (row side filtered) as a result, not a game count', () => {
    const filtered = matrix();
    filtered.cells = filtered.cells.map((c) =>
      c.row === 'Orks' && c.col === 'Orks' ? { ...c, games: 10, wins: 6, winRate: 0.6 } : c,
    );
    renderWithProviders(
      <FactionMatrix
        matrix={filtered}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Orks vs Orks: 60% win rate over 10 games' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Necrons vs Necrons: 3 games' })).toBeInTheDocument();
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

  it('has a colour legend that names each colour, so colour never carries meaning alone', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    const legend = screen.getByRole('list', { name: 'Colour key' });
    expect(legend.textContent).toBe('Row does worse (orange)Even (grey)Row does better (blue)');
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

  it('says which factions a cell is when it is hovered', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseOver(screen.getByRole('button', { name: /Orks vs Necrons/ }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Orks vs Necrons: 50% win rate over 3 games',
    );
    fireEvent.mouseLeave(screen.getByRole('table'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('says which factions a hidden cell is, and that it has too few games', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 5 }}
        onCell={vi.fn()}
      />,
    );
    const [hidden] = screen.getAllByText('·');
    if (hidden === undefined) throw new Error('no hidden cell');
    fireEvent.mouseOver(hidden);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/ vs .*: \d+ games, under the minimum/);
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
      columns: ['Orks', 'Necrons'],
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

  describe('detachment rows', () => {
    const vs = (col: string, games: number, wins: number, losses: number) => ({
      row: 'Orks',
      col,
      games,
      wins,
      draws: 0,
      losses,
      winRate: wins / games,
      avgPoints: null,
    });
    const orks: DetachmentRowsResponse = {
      faction: 'Orks',
      rows: [
        { detachment: 'War Horde', games: 4, cells: [vs('Necrons', 3, 1, 2), vs('Orks', 1, 1, 0)] },
        {
          detachment: 'Butchers of Khorne’s Chosen',
          games: 1,
          cells: [vs('Necrons', 1, 0, 1)],
        },
      ],
    };
    const asked: string[] = [];
    const detachments: DetachmentRowsQuery = (faction) => ({
      queryKey: ['detachments', faction],
      queryFn: () => {
        asked.push(faction);
        return Promise.resolve(orks);
      },
    });
    const renderMatrix = (onCell = vi.fn()) =>
      renderWithProviders(
        <FactionMatrix
          matrix={matrix()}
          scoring={{ consistent: true, scale: 20 }}
          settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
          onCell={onCell}
          detachments={detachments}
        />,
      );

    it('opens a faction’s detachments under its row when its name is clicked, and closes them', async () => {
      renderMatrix();
      const orksButton = screen.getByRole('button', { name: 'Orks' });
      expect(orksButton).toHaveAttribute('aria-expanded', 'false');
      expect(asked).toEqual([]);
      fireEvent.click(orksButton);
      expect(orksButton).toHaveAttribute('aria-expanded', 'true');
      expect(await screen.findByRole('rowheader', { name: 'War Horde' })).toBeInTheDocument();
      expect(
        screen.getByRole('rowheader', { name: 'Butchers of Khorne’s Chosen' }),
      ).toBeInTheDocument();
      // Under the Orks row, before Necrons.
      const headers = screen.getAllByRole('rowheader').map((th) => th.textContent);
      expect(headers.indexOf('War Horde')).toBe(headers.findIndex((h) => h.includes('Orks')) + 1);
      fireEvent.click(orksButton);
      expect(screen.queryByRole('rowheader', { name: 'War Horde' })).toBeNull();
    });

    it('shows each detachment’s result against every opponent, with a win rate against its own faction', async () => {
      renderMatrix();
      fireEvent.click(screen.getByRole('button', { name: 'Orks' }));
      const row = (await screen.findByRole('rowheader', { name: 'War Horde' })).closest('tr');
      if (row === null) throw new Error('no War Horde row');
      expect(
        within(row).getByRole('button', {
          name: 'Orks · War Horde vs Necrons: 33% win rate over 3 games',
        }),
      ).toBeInTheDocument();
      expect(
        within(row).getByRole('button', {
          name: 'Orks · War Horde vs Orks: 100% win rate over 1 games',
        }),
      ).toBeInTheDocument();
    });

    it('opens a detachment cell’s games for that detachment', async () => {
      const onCell = vi.fn();
      renderMatrix(onCell);
      fireEvent.click(screen.getByRole('button', { name: 'Orks' }));
      fireEvent.click(await screen.findByRole('button', { name: /Orks · War Horde vs Necrons/ }));
      expect(onCell).toHaveBeenCalledWith({ row: 'Orks', col: 'Necrons', detachment: 'War Horde' });
    });
  });
});
