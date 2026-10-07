import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { DamageChart, quartiles } from './DamageChart';

// P(damage = 0..3).
const dist = [0.1, 0.2, 0.4, 0.3];

const axisLabels = (side: 'left' | 'right') =>
  [...document.querySelectorAll(`svg text[data-axis="${side}"]`)].map((t) => t.textContent);

describe('quartiles', () => {
  it('finds the totals a quarter, half and three quarters of results reach', () => {
    // At most: 0 → 10%, 1 → 30%, 2 → 70%, 3 → 100%.
    expect(quartiles(dist)).toEqual([1, 2, 3]);
    // UnitCrunch's example: 0 damage just under a quarter of the time.
    expect(quartiles([0.246, 0.48, 0.23, 0.044])).toEqual([1, 1, 2]);
  });
});

describe('DamageChart', () => {
  it('draws a bar per total and an "at least" line, each on its own axis', () => {
    renderWithProviders(<DamageChart woundsDealt={dist} />);
    expect(screen.getByRole('img', { name: /Damage dealt/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('damage-bar')).toHaveLength(4);
    expect(screen.getAllByTestId('at-least-point')).toHaveLength(4);
    expect(axisLabels('left')).toEqual(['10%', '20%', '30%', '40%', '50%']);
    expect(axisLabels('right')).toEqual(['20%', '40%', '60%', '80%', '100%']);
  });

  it('names both in a legend and marks the quartiles, the median strongest', () => {
    renderWithProviders(<DamageChart woundsDealt={dist} />);
    const legend = within(screen.getByRole('list', { name: 'Legend' }));
    expect(legend.getByText('Exactly')).toBeInTheDocument();
    expect(legend.getByText('At least')).toBeInTheDocument();
    expect(screen.getByTestId('quartile-Q2')).toHaveAttribute('data-total', '2');
    expect(screen.getByTestId('quartile-Q1')).toHaveAttribute('data-total', '1');
    expect(screen.getByTestId('quartile-Q3')).toHaveAttribute('data-total', '3');
  });

  it('shows a total’s chances and the quartiles on hover', () => {
    renderWithProviders(<DamageChart woundsDealt={dist} />);
    fireEvent.mouseEnter(screen.getAllByTestId('damage-bar')[2] as Element);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('2: 40%');
    expect(tip).toHaveTextContent('2+: 70%');
    expect(tip).toHaveTextContent('Q1: 1 · Q2: 2 · Q3: 3');
  });

  it('reads the numbers out in a table for screen readers', () => {
    renderWithProviders(<DamageChart woundsDealt={dist} />);
    expect(screen.getByRole('cell', { name: '40%' }).closest('tr')?.textContent).toBe('240%70%');
  });
});
