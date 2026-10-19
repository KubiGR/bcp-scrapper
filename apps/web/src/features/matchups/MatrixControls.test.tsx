import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { MatrixControls } from './MatrixControls';
import { DEFAULT_MATRIX_SETTINGS } from './matrix-view';

describe('MatrixControls', () => {
  it('offers Min games, and no switch to game points: always win rate', () => {
    renderWithProviders(
      <MatrixControls settings={DEFAULT_MATRIX_SETTINGS} onChange={vi.fn()} dispositions={[]} />,
    );
    expect(screen.queryByRole('radio', { name: 'Game points' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Metric' })).toBeNull();
    expect(screen.getByLabelText('Min games')).toHaveValue('25');
  });

  it('orders the factions best first, or A→Z', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <MatrixControls settings={DEFAULT_MATRIX_SETTINGS} onChange={onChange} dispositions={[]} />,
    );
    const order = within(screen.getByRole('radiogroup', { name: 'Order' }));
    expect(order.getByRole('radio', { name: 'Best first' })).toBeChecked();
    fireEvent.click(order.getByRole('radio', { name: 'A→Z' }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MATRIX_SETTINGS, order: 'name' });
  });

  it('offers the five known dispositions plus any others from the data', async () => {
    renderWithProviders(
      <MatrixControls
        settings={DEFAULT_MATRIX_SETTINGS}
        onChange={vi.fn()}
        dispositions={['Something New']}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Disposition' }));
    expect(await screen.findByRole('option', { name: 'Take and Hold' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Something New' })).toBeInTheDocument();
  });

  it('filters the rows to picked factions, from those in the matrix', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <MatrixControls
        settings={DEFAULT_MATRIX_SETTINGS}
        onChange={onChange}
        dispositions={[]}
        factions={['Orks', 'Necrons']}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Factions' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Necrons' }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MATRIX_SETTINGS, factions: ['Necrons'] });
  });

  it('shows the row/both side control only once a disposition is chosen', () => {
    renderWithProviders(
      <MatrixControls settings={DEFAULT_MATRIX_SETTINGS} onChange={vi.fn()} dispositions={[]} />,
    );
    expect(screen.queryByRole('radio', { name: 'Row side' })).toBeNull();

    renderWithProviders(
      <MatrixControls
        settings={{ ...DEFAULT_MATRIX_SETTINGS, dispositions: ['Take and Hold'] }}
        onChange={vi.fn()}
        dispositions={[]}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Row side' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Both sides' })).toBeInTheDocument();
  });

  it('calls onChange with the new min games', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <MatrixControls settings={DEFAULT_MATRIX_SETTINGS} onChange={onChange} dispositions={[]} />,
    );
    fireEvent.change(screen.getByLabelText('Min games'), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MATRIX_SETTINGS, minGames: 5 });
  });

  it('offers the loaded detachments, and shows the side switch once one is chosen', async () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(
      <MatrixControls
        settings={DEFAULT_MATRIX_SETTINGS}
        onChange={onChange}
        dispositions={[]}
        detachments={['War Horde', 'Wreckas']}
      />,
    );
    expect(screen.queryByRole('radio', { name: 'Both sides' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Detachment' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Wreckas' }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MATRIX_SETTINGS, detachments: ['Wreckas'] });

    rerender(
      <MatrixControls
        settings={{ ...DEFAULT_MATRIX_SETTINGS, detachments: ['Wreckas'] }}
        onChange={onChange}
        dispositions={[]}
        detachments={['War Horde', 'Wreckas']}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Both sides' })).toBeInTheDocument();
  });
});
