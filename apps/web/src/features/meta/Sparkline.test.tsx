import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { Sparkline } from './Sparkline';

const weeks = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];

describe('Sparkline', () => {
  it('draws the weekly shares, breaking the line at weeks without events', () => {
    renderWithProviders(<Sparkline values={[0.01, null, 0.02, 0.024]} weeks={weeks} />);
    const chart = screen.getByRole('img', { name: 'Share by week: 1.0% to 2.4%' });
    const lines = chart.querySelectorAll('polyline');
    // One point before the gap, two after.
    expect([...lines].map((line) => line.getAttribute('points')?.split(' ').length)).toEqual([
      1, 2,
    ]);
    expect(chart.querySelector('title')?.textContent).toContain('7 Sep: 1.0%');
    expect(chart.querySelector('title')?.textContent).toContain('14 Sep: no events');
  });

  it('draws nothing without at least one week', () => {
    const { container } = renderWithProviders(<Sparkline values={[]} weeks={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
