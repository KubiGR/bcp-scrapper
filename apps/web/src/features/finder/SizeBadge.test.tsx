import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { SizeBadge, sizeTier } from './SizeBadge';

describe('SizeBadge', () => {
  it('stands out more the bigger the event (the rankings’ 100 and 200 steps)', () => {
    expect(sizeTier(12)).toBe('small');
    expect(sizeTier(50)).toBe('medium');
    expect(sizeTier(100)).toBe('large');
    expect(sizeTier(432)).toBe('major');
  });

  it('shows the players, with the tier for styling', () => {
    renderWithProviders(<SizeBadge playerCount={432} />);
    expect(screen.getByText('432 players')).toHaveAttribute('data-tier', 'major');
  });
});
