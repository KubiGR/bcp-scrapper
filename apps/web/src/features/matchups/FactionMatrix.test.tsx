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
      games: 2,
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

const lopsided = (): FactionMatrixData => ({
  factions: ['Necrons', 'Orks'],
  columns: ['Aeldari', 'Necrons', 'Orks'],
  games: 24,
  cells: [
    {
      row: 'Orks',
      col: 'Necrons',
      games: 10,
      wins: 7,
      draws: 0,
      losses: 3,
      winRate: 0.7,
      avgPoints: 14,
    },
    {
      row: 'Orks',
      col: 'Aeldari',
      games: 10,
      wins: 5,
      draws: 0,
      losses: 5,
      winRate: 0.5,
      avgPoints: 10,
    },
    {
      row: 'Necrons',
      col: 'Orks',
      games: 10,
      wins: 3,
      draws: 0,
      losses: 7,
      winRate: 0.3,
      avgPoints: 6,
    },
    // Too few games: in the overall, not in the average or spread.
    {
      row: 'Necrons',
      col: 'Aeldari',
      games: 2,
      wins: 2,
      draws: 0,
      losses: 0,
      winRate: 1,
      avgPoints: 18,
    },
  ],
});

describe('FactionMatrix row summary', () => {
  it('shows each faction’s overall win rate and rank, its average match-up and its spread', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={lopsided()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 3 }}
        onCell={vi.fn()}
      />,
    );
    const rowOf = (name: string) => {
      const row = screen.getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr');
      if (row === null) throw new Error(`no row ${name}`);
      return within(row);
    };
    expect(screen.getByRole('columnheader', { name: 'Average' })).toBeInTheDocument();
    // Spread before Average, as a bar of good, even and bad match-ups.
    const headings = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headings.slice(-2)).toEqual(['Spread', 'Average']);
    expect(screen.getByRole('columnheader', { name: 'Spread' })).toBeInTheDocument();
    const orks = rowOf('Orks');
    expect(orks.getByText('60% · #1')).toBeInTheDocument();
    expect(orks.getByLabelText('Average match-up')).toHaveTextContent('60%');
    expect(orks.getByLabelText('Spread')).toHaveTextContent('1 good · 1 even · 0 bad');
    const bar = orks.getByRole('img', { name: '1 good, 1 even, 0 bad' });
    const width = (part: string) =>
      bar.querySelector<HTMLElement>(`[data-part="${part}"]`)?.style.width;
    expect([width('good'), width('even'), width('bad')]).toEqual(['50%', '50%', '0%']);
    // Necrons: 5 of 12 overall; only the Orks match-up has enough games.
    const necrons = rowOf('Necrons');
    expect(necrons.getByText('42% · #2')).toBeInTheDocument();
    expect(necrons.getByLabelText('Average match-up')).toHaveTextContent('30%');
    expect(necrons.getByLabelText('Spread')).toHaveTextContent('0 good · 0 even · 1 bad');
    // The average in the colours of a cell: Necrons' 30% is bad.
    expect(necrons.getByLabelText('Average match-up')).toHaveAttribute('data-tone', 'bad');
    expect(
      screen.getByText(
        'Cells are hatched and greyed below 3 games — they’re left out of every Spread and Average.',
      ),
    ).toBeInTheDocument();
  });
});

describe('FactionMatrix order', () => {
  const names = (role: 'rowheader' | 'columnheader') =>
    screen.getAllByRole(role).map((th) => th.textContent);

  it('puts the best overall win rate first, rows and columns, opponents without a row last', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={lopsided()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 3 }}
        onCell={vi.fn()}
      />,
    );
    expect(names('rowheader')).toEqual(['Orks60% · #1', 'Necrons42% · #2']);
    expect(names('columnheader')).toEqual(['', 'Orks', 'Necrons', 'Aeldari', 'Spread', 'Average']);
  });

  it('orders them A→Z when asked', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={lopsided()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 3, order: 'name' }}
        onCell={vi.fn()}
      />,
    );
    expect(names('rowheader')).toEqual(['Necrons42% · #2', 'Orks60% · #1']);
    expect(names('columnheader')).toEqual(['', 'Aeldari', 'Necrons', 'Orks', 'Spread', 'Average']);
  });
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
    expect(screen.getByRole('rowheader', { name: /^Necrons/ })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Orks vs Necrons/ });
    // Just the number: the % and the game count are in its label.
    expect(button.textContent).toBe('50');
    expect(button).toHaveAccessibleName(/50% win rate over 3 games/);
  });

  it('shows every opponent as a column even when fewer factions are rows', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={{ ...matrix(), factions: ['Orks'], columns: ['Necrons', 'Orks'] }}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, order: 'name', minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '',
      'Necrons',
      'Orks',
      'Spread',
      'Average',
    ]);
    // The name, then its overall win rate and rank.
    expect(screen.getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Orks50% · #1']);
    expect(screen.getByRole('button', { name: /Orks vs Necrons/ })).toBeInTheDocument();
  });

  it('shows only the picked factions as rows, still against every opponent', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, order: 'name', minGames: 1, factions: ['Necrons'] }}
        onCell={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('rowheader').map((th) => th.textContent)).toEqual([
      expect.stringMatching(/^Necrons/),
    ]);
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '',
      'Necrons',
      'Orks',
      'Spread',
      'Average',
    ]);
  });

  it('hatches a cell under minGames, its value still there', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 5 }}
        onCell={vi.fn()}
      />,
    );
    // Hatched over its colour, the value still there.
    expect(screen.getAllByText('50').length).toBeGreaterThan(0);
  });

  it('shows only the count of games played on a mirror cell', () => {
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

  it('still opens a hatched cell’s games', () => {
    const onCell = vi.fn();
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 5 }}
        onCell={onCell}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Orks vs Necrons/ }));
    expect(onCell).toHaveBeenCalledWith({ row: 'Orks', col: 'Necrons' });
  });

  it('says which factions a hidden cell is, and that it has too few games', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, order: 'name', minGames: 5 }}
        onCell={vi.fn()}
      />,
    );
    fireEvent.mouseOver(screen.getByRole('button', { name: /^Orks vs Necrons/ }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      /Orks vs Necrons: 50% over 3 games, too few: left out of Spread and Average/,
    );
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
    const rowHeader = screen.getByRole('rowheader', { name: /^Necrons/ });
    expect(rowHeader.className).toMatch(/stickyRowHeader/);
  });

  it('stacks each slanted column heading over the next, and the corner over them all', () => {
    renderWithProviders(
      <FactionMatrix
        matrix={matrix()}
        scoring={{ consistent: true, scale: 20 }}
        settings={{ ...DEFAULT_MATRIX_SETTINGS, minGames: 1 }}
        onCell={vi.fn()}
      />,
    );
    // The factions' headings: not the corner, nor Average and Spread after them.
    const headings = screen.getAllByRole('columnheader').slice(1, -2);
    const layers = headings.map((el) => Number(el.style.zIndex));
    expect(layers.length).toBeGreaterThan(1);
    expect(layers).toEqual([...layers].sort((a, b) => b - a));
    expect(new Set(layers).size).toBe(layers.length);
    const corner = Number(screen.getByTestId('matrix-corner').style.zIndex);
    expect(corner).toBeGreaterThan(Math.max(...layers));
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
