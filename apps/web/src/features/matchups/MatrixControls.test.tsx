import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { MatrixControls } from './MatrixControls';
import { DEFAULT_MATRIX_SETTINGS } from './matrix-view';

describe('MatrixControls', () => {
  it('offers Win rate and Game points, and Min games', () => {
    renderWithProviders(
      <MatrixControls
        settings={DEFAULT_MATRIX_SETTINGS}
        onChange={vi.fn()}
        scoring={{ consistent: true, scale: 20 }}
        dispositions={[]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Win rate' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Game points' })).toBeEnabled();
    expect(screen.getByLabelText('Min games')).toHaveValue('3');
  });

  it('disables Game points with a reason when scales differ', () => {
    renderWithProviders(
      <MatrixControls
        settings={DEFAULT_MATRIX_SETTINGS}
        onChange={vi.fn()}
        scoring={{ consistent: false, scale: null }}
        dispositions={[]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Game points' })).toBeDisabled();
    expect(screen.getByText('Events use different scoring')).toBeInTheDocument();
  });

  it('disables Game points with a different reason when there is no scale at all', () => {
    renderWithProviders(
      <MatrixControls
        settings={DEFAULT_MATRIX_SETTINGS}
        onChange={vi.fn()}
        scoring={{ consistent: true, scale: null }}
        dispositions={[]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Game points' })).toBeDisabled();
    expect(screen.getByText('No game points recorded')).toBeInTheDocument();
  });

  it('offers the five known dispositions plus any others from the data', async () => {
    renderWithProviders(
      <MatrixControls
        settings={DEFAULT_MATRIX_SETTINGS}
        onChange={vi.fn()}
        scoring={{ consistent: true, scale: 20 }}
        dispositions={['Something New']}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Disposition' }));
    expect(await screen.findByRole('option', { name: 'Take and Hold' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Something New' })).toBeInTheDocument();
  });

  it('shows the row/both side control only once a disposition is chosen', () => {
    renderWithProviders(
      <MatrixControls
        settings={DEFAULT_MATRIX_SETTINGS}
        onChange={vi.fn()}
        scoring={{ consistent: true, scale: 20 }}
        dispositions={[]}
      />,
    );
    expect(screen.queryByRole('radio', { name: 'Row side' })).toBeNull();

    renderWithProviders(
      <MatrixControls
        settings={{ ...DEFAULT_MATRIX_SETTINGS, disposition: 'Take and Hold' }}
        onChange={vi.fn()}
        scoring={{ consistent: true, scale: 20 }}
        dispositions={[]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Row side' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Both sides' })).toBeInTheDocument();
  });

  it('calls onChange with the new min games', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <MatrixControls
        settings={DEFAULT_MATRIX_SETTINGS}
        onChange={onChange}
        scoring={{ consistent: true, scale: 20 }}
        dispositions={[]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Min games'), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MATRIX_SETTINGS, minGames: 5 });
  });
});
