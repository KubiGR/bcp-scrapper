import { calculate } from '@bcp/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { defaultForm, toCalculation } from './form-state';
import { MonteCarloCheck } from './MonteCarloCheck';

const setup = () => {
  const read = toCalculation(defaultForm());
  if (!('calculation' in read)) throw new Error(read.error);
  return { calculation: read.calculation, result: calculate(read.calculation) };
};

describe('MonteCarloCheck', () => {
  it('rolls the games on request and sets them beside the exact numbers', async () => {
    const { calculation, result } = setup();
    renderWithProviders(<MonteCarloCheck calculation={calculation} result={result} games={5000} />);
    expect(screen.queryByRole('table', { name: 'Monte Carlo check' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Check with Monte Carlo/ }));
    const table = within(await screen.findByRole('table', { name: 'Monte Carlo check' }));
    for (const name of ['Exact', 'Monte Carlo', 'Diff']) {
      expect(table.getByRole('columnheader', { name })).toBeInTheDocument();
    }
    expect(table.getByRole('rowheader', { name: 'Wipe' })).toBeInTheDocument();
    expect(screen.getByText(/5,000 games/)).toBeInTheDocument();
  });
});
