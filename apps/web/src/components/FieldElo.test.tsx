import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { FieldElo, fieldEloTier } from './FieldElo';

describe('FieldElo', () => {
  it('calls everything up to 1549 average, then bands by 50', () => {
    expect([1400, 1549, 1550, 1599, 1600, 1649, 1650].map((elo) => fieldEloTier(elo).tier)).toEqual(
      ['average', 'average', 'strong', 'strong', 'very-strong', 'very-strong', 'elite'],
    );
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
