import { analysePairing } from '@bcp/shared';
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
});
