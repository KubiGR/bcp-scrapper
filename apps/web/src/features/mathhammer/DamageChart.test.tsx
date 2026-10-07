import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { DamageChart } from './DamageChart';

// P(damage = 0..3).
const dist = [0.1, 0.2, 0.4, 0.3];

describe('DamageChart', () => {
  it('draws a bar per damage total, each saying its chances', () => {
    renderWithProviders(<DamageChart woundsDealt={dist} />);
    expect(screen.getByRole('img', { name: /Damage dealt/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('damage-bar')).toHaveLength(4);
    expect(screen.getByRole('cell', { name: '40%' }).closest('tr')?.textContent).toBe('240%70%');
  });

  it('shows a bar’s chances on hover', () => {
    renderWithProviders(<DamageChart woundsDealt={dist} />);
    const bars = screen.getAllByTestId('damage-bar');
    fireEvent.mouseEnter(bars[2] as Element);
    expect(screen.getByRole('tooltip')).toHaveTextContent('2 damage: 40% exactly, 70% at least');
  });

  it('switches the bars between exactly and at least', () => {
    renderWithProviders(<DamageChart woundsDealt={dist} />);
    const height = () => Number(screen.getAllByTestId('damage-bar')[0]?.getAttribute('height'));
    const exactly = height();
    fireEvent.click(screen.getByRole('radio', { name: 'At least' }));
    // At least 0 damage is certain: the tallest bar.
    expect(height()).toBeGreaterThan(exactly);
  });

  it('labels the axis in round steps', () => {
    renderWithProviders(<DamageChart woundsDealt={[0.08, 0.22, 0.29, 0.24, 0.17]} />);
    const labels = [...document.querySelectorAll('svg text')]
      .map((t) => t.textContent)
      .filter((t) => t.endsWith('%'));
    expect(labels).toEqual(['10%', '20%', '30%']);
  });
});
