import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { SizeFilter } from './SizeFilter';

describe('SizeFilter', () => {
  it('switches presets', () => {
    const onChange = vi.fn();
    renderWithProviders(<SizeFilter search={{ size: '40' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: '100+' }));
    expect(onChange).toHaveBeenCalledWith({ size: '100' });
    expect(screen.queryByLabelText('Min players')).toBeNull();
  });

  it('shows min and max inputs for a custom size', () => {
    renderWithProviders(
      <SizeFilter search={{ size: 'custom', min: 50, max: 120 }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Min players')).toHaveValue('50');
    expect(screen.getByLabelText('Max players')).toHaveValue('120');
  });

  it('writes typed bounds to the URL without adding history entries', () => {
    const onChange = vi.fn();
    renderWithProviders(<SizeFilter search={{ size: 'custom' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Min players'), { target: { value: '50' } });
    expect(onChange).toHaveBeenCalledWith({ min: 50 }, { replace: true });
  });
});
