import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { FactionText } from './FactionText';

describe('FactionText', () => {
  it('shows a BCP faction plainly', () => {
    renderWithProviders(<FactionText faction="Orks" guessed={false} />);
    expect(screen.getByText('Orks')).toBeInTheDocument();
    expect(screen.queryByLabelText('Guessed from the list')).not.toBeInTheDocument();
  });

  it('marks a guessed army with a focusable warning that explains itself', async () => {
    renderWithProviders(<FactionText faction="Necrons" guessed />);
    // An image with a name, so screen readers announce it.
    const icon = screen.getByRole('img', { name: 'Guessed from the list' });
    expect(icon).toHaveAttribute('tabindex', '0');
    fireEvent.focus(icon);
    expect(
      await screen.findByText('From the list — BCP has no army for this player'),
    ).toBeInTheDocument();
  });

  it('says so when the faction is unknown', () => {
    renderWithProviders(<FactionText faction={null} guessed={false} />);
    expect(screen.getByText('Unknown faction')).toBeInTheDocument();
  });
});
