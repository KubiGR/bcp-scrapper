import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { FieldElo, fieldEloTier } from './FieldElo';

describe('FieldElo', () => {
  it('bands fields by 50 around the average 1550', () => {
    expect(
      [1499, 1500, 1549, 1550, 1599, 1600, 1649, 1650].map((elo) => fieldEloTier(elo).tier),
    ).toEqual([
      'weak',
      'average',
      'average',
      'strong',
      'strong',
      'very-strong',
      'very-strong',
      'elite',
    ]);
  });

  it('colours the number by its band, and names the band for screen readers', () => {
    renderWithProviders(<FieldElo elo={1660} />);
    const elo = screen.getByLabelText('Elite field: average wh40k-elo of the field 1660');
    expect(elo).toHaveTextContent('Elo 1660');
    expect(screen.getByText('Elo 1660')).toHaveAttribute('data-tier', 'elite');
  });

  it('shows nothing for an unrated field', () => {
    renderWithProviders(<FieldElo elo={null} />);
    expect(screen.queryByText(/Elo/)).toBeNull();
  });
});
