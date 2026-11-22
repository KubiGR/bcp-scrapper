import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { SearchSelect } from './SearchSelect';

function Picker() {
  const [value, setValue] = useState<string | null>('orks');
  return (
    <SearchSelect
      label="Army"
      placeholder="Pick an army"
      value={value}
      onChange={setValue}
      data={[
        { value: 'orks', label: 'Orks' },
        { value: 'gk', label: 'Grey Knights' },
      ]}
    />
  );
}

describe('SearchSelect', () => {
  it('shows the choice, clears to search when opened again, and keeps the choice as a hint', () => {
    renderWithProviders(<Picker />);
    const input = screen.getByRole<HTMLInputElement>('combobox', { name: 'Army' });
    expect(input.value).toBe('Orks');
    fireEvent.focus(input);
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('Orks');
  });

  it('closed without a new pick, the old choice comes back', () => {
    renderWithProviders(<Picker />);
    const input = screen.getByRole<HTMLInputElement>('combobox', { name: 'Army' });
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(input.value).toBe('Orks');
    expect(input.placeholder).toBe('Pick an army');
  });

  it('a new pick shows its name', async () => {
    renderWithProviders(<Picker />);
    const input = screen.getByRole<HTMLInputElement>('combobox', { name: 'Army' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'gr' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Grey Knights' }));
    expect(input.value).toBe('Grey Knights');
  });

  it('on a touch screen, is a list to tap: no typing, so no keyboard', async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      Object.assign(matchMedia(query), { matches: query === '(pointer: coarse)' });
    try {
      renderWithProviders(<Picker />);
      const input = screen.getByRole<HTMLInputElement>('combobox', { name: 'Army' });
      expect(input).toHaveAttribute('readonly');
      fireEvent.click(input);
      fireEvent.click(await screen.findByRole('option', { name: 'Grey Knights' }));
      expect(input.value).toBe('Grey Knights');
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});
