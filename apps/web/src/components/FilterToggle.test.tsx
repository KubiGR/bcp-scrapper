import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { FilterToggle } from './FilterToggle';

describe('FilterToggle', () => {
  it('shows and hides the filters on phones, counting the ones in use', () => {
    renderWithProviders(
      <FilterToggle active={2}>
        <input aria-label="Faction" />
      </FilterToggle>,
    );
    const toggle = screen.getByRole('button', { name: 'Filters (2)' });
    const filters = screen.getByLabelText('Faction').parentElement;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(filters).not.toHaveAttribute('data-open');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(filters).toHaveAttribute('data-open');
  });

  it('says just Filters when none is in use', () => {
    renderWithProviders(
      <FilterToggle active={0}>
        <input aria-label="Faction" />
      </FilterToggle>,
    );
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });
});
