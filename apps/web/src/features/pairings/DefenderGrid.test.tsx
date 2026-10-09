import { analysePairing, solveMatrixGame } from '@bcp/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { DefenderGrid } from './DefenderGrid';
import { PairingSummary } from './PairingSummary';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];
const names = (xs: string[]) =>
  xs.map((faction, i) => ({ id: `${i}`, name: `P${i}`, faction, detachments: [], list: null }));
const ours = names([
  'Space Marines',
  "Emperor's Children",
  'Chaos Daemons',
  'World Eaters',
  'Adepta Sororitas',
]);
const theirs = names([
  'Grey Knights',
  'Death Guard',
  'Orks',
  'Chaos Space Marines',
  'Adeptus Custodes',
]);

describe('summary and defender grid', () => {
  it('summarises: expected team score, the safe defender, their likely defender', () => {
    renderWithProviders(
      <PairingSummary analysis={analysePairing(R1)} ours={ours} theirs={theirs} />,
    );
    expect(screen.getByText('49.7')).toBeInTheDocument();
    expect(screen.getByText('Expected team score (of 100)')).toBeInTheDocument();
    // World Eaters is both the safe defender and in the unpredictable mix.
    expect(screen.getAllByText(/World Eaters/).length).toBeGreaterThan(0);
    expect(screen.getByText('Adeptus Custodes')).toBeInTheDocument();
  });

  it('shows every defender pair and selects one on click', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <DefenderGrid
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        selected={{ d: 3, e: 4 }}
        onSelect={onSelect}
      />,
    );
    const cell = screen.getByRole('button', {
      name: 'You defend World Eaters, they defend Chaos Space Marines: 49.1',
    });
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith(3, 3);
    expect(
      screen.getByRole('button', { name: /You defend World Eaters, they defend Adeptus Custodes/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('ends each row with its average, its expected value against their likely defender, and its worst', () => {
    const analysis = analysePairing(R1);
    renderWithProviders(
      <DefenderGrid
        analysis={analysis}
        ours={ours}
        theirs={theirs}
        selected={{ d: 3, e: 4 }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Avg' })).toBeInTheDocument();
    const row = analysis.defenderGrid[3] ?? [];
    const avg = row.reduce((s, v) => s + v, 0) / row.length;
    const expected = row.reduce((s, v, e) => s + v * (analysis.theirDefender[e] ?? 0), 0);
    const cells = within(screen.getByRole('row', { name: /^World Eaters/ }));
    expect(cells.getByLabelText('World Eaters average')).toHaveTextContent(avg.toFixed(1));
    expect(cells.getByLabelText('World Eaters expected')).toHaveTextContent(expected.toFixed(1));
    expect(cells.getByLabelText('World Eaters worst')).toHaveTextContent(
      Math.min(...row).toFixed(1),
    );
    expect(cells.getByLabelText('World Eaters best')).toHaveTextContent(
      Math.max(...row).toFixed(1),
    );
  });

  it('a defender of theirs marked as one they won’t pick drops out of every row’s numbers', () => {
    const analysis = analysePairing(R1);
    renderWithProviders(
      <DefenderGrid
        analysis={analysis}
        ours={ours}
        theirs={theirs}
        selected={{ d: 3, e: 4 }}
        onSelect={() => {}}
      />,
    );
    const custodes = screen.getByRole('button', { name: /^Adeptus Custodes/ });
    fireEvent.click(custodes);
    expect(custodes).toHaveAttribute('aria-pressed', 'true');
    const kept = [0, 1, 2, 3];
    const row = kept.map((e) => analysis.defenderGrid[3]?.[e] ?? 0);
    // Their likely defender, solved again among the ones left.
    const mix = solveMatrixGame(analysis.defenderGrid.map((r) => kept.map((e) => r[e] ?? 0))).cols;
    const cells = within(screen.getByRole('row', { name: /^World Eaters/ }));
    expect(cells.getByLabelText('World Eaters average')).toHaveTextContent(
      (row.reduce((a, v) => a + v, 0) / 4).toFixed(1),
    );
    expect(cells.getByLabelText('World Eaters worst')).toHaveTextContent(
      Math.min(...row).toFixed(1),
    );
    expect(cells.getByLabelText('World Eaters best')).toHaveTextContent(
      Math.max(...row).toFixed(1),
    );
    expect(cells.getByLabelText('World Eaters expected')).toHaveTextContent(
      row.reduce((a, v, j) => a + v * (mix[j] ?? 0), 0).toFixed(1),
    );
    // And back.
    fireEvent.click(custodes);
    expect(custodes).toHaveAttribute('aria-pressed', 'false');
  });

  it('says their defenders can be clicked to rule out, and marks them with an eye', () => {
    renderWithProviders(
      <DefenderGrid
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        selected={{ d: 3, e: 4 }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/Click a defender of theirs to rule them out/)).toBeInTheDocument();
    const orks = screen.getByRole('button', { name: /^Orks/ });
    expect(orks.querySelector('[data-icon="eye"]')).not.toBeNull();
    fireEvent.click(orks);
    expect(orks.querySelector('[data-icon="eye-off"]')).not.toBeNull();
  });

  it('gives their defenders equal columns, whatever the length of the army name', () => {
    renderWithProviders(
      <DefenderGrid
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        selected={{ d: 0, e: 0 }}
        onSelect={vi.fn()}
      />,
    );
    const table = screen.getByRole('table');
    expect(table.style.tableLayout).toBe('fixed');
    const cols = [...table.querySelectorAll('col')].map((c) => c.style.width);
    // The name column, five equal defender columns, then the four summaries.
    expect(cols).toHaveLength(10);
    expect(new Set(cols.slice(1, 6)).size).toBe(1);
  });
});
