import { calculate, DEFAULT_MODS } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { defaultForm, toCalculation } from './form-state';
import { ShareResult } from './ShareResult';

const toBlob = vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' })));
vi.mock('html-to-image', () => ({ toBlob: (...args: unknown[]) => toBlob(...(args as [])) }));

const setup = () => {
  const form = defaultForm();
  form.unit = { ...DEFAULT_MODS, lethalHits: true };
  form.source = 'Intercessor Squad';
  form.defender = { ...form.defender, source: 'Boyz' };
  const read = toCalculation(form);
  if (!('calculation' in read)) throw new Error(read.error);
  return { form, calculation: read.calculation, result: calculate(read.calculation) };
};

afterEach(() => {
  vi.unstubAllGlobals();
  toBlob.mockClear();
});

describe('ShareResult', () => {
  it('opens a card with the matchup, profiles, modifiers, numbers and graph', () => {
    const { form, calculation, result } = setup();
    renderWithProviders(<ShareResult form={form} calculation={calculation} result={result} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const card = within(screen.getByTestId('share-card'));
    expect(card.getByText('Intercessor Squad → Boyz')).toBeInTheDocument();
    expect(card.getByText('5× Bolt rifle')).toBeInTheDocument();
    expect(card.getByText('A 2 · BS 3+ · S 4 · AP -1 · D 1')).toBeInTheDocument();
    expect(card.getByText(/Lethal Hits/)).toBeInTheDocument();
    expect(card.getByText('10× Boyz · T 5 · Sv 5+ · W 1')).toBeInTheDocument();
    // Whole numbers lead, with the average and most likely beside them.
    expect(
      card.getAllByText(`average ${result.averages.modelsSlain.toFixed(2)}`, { exact: false }),
    ).toHaveLength(2);
    expect(card.getByRole('img', { name: /^Damage dealt/ })).toBeInTheDocument();
    // The maths step by step, and what was set on top of the datasheets.
    expect(card.getByRole('table', { name: 'Step by step' })).toBeInTheDocument();
    expect(card.getByText('Unit: Lethal Hits')).toBeInTheDocument();
  });

  it('downloads the card as a PNG', async () => {
    const { form, calculation, result } = setup();
    const createObjectURL = vi.fn(() => 'blob:card');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    renderWithProviders(<ShareResult form={form} calculation={calculation} result={result} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download PNG' }));
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
    });
    expect(toBlob).toHaveBeenCalledWith(screen.getByTestId('share-card'), expect.anything());
  });
});
