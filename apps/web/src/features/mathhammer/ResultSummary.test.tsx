import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { calculateForm } from './best';
import { defaultForm } from './form-state';
import { ResultSummary } from './ResultSummary';

describe('ResultSummary', () => {
  it('sums up the result in a bar, and jumps to the full result', () => {
    const outcome = calculateForm(defaultForm());
    if ('error' in outcome) throw new Error(outcome.error);
    const onShow = vi.fn();
    renderWithProviders(<ResultSummary outcome={outcome} onShow={onShow} />);
    const bar = screen.getByRole('region', { name: 'Result summary' });
    const total = (key: 'attacks' | 'hits' | 'wounds' | 'unsaved') =>
      outcome.result.breakdown.reduce((sum, step) => sum + step[key], 0).toFixed(2);
    expect(bar).toHaveTextContent(`Attacks ${total('attacks')}`);
    expect(bar).toHaveTextContent(`Hits ${total('hits')}`);
    expect(bar).toHaveTextContent(`Wounds ${total('wounds')}`);
    expect(bar).toHaveTextContent(`Unsaved ${total('unsaved')}`);
    expect(bar).toHaveTextContent(`Damage ${outcome.result.averages.woundsDealt.toFixed(2)}`);
    expect(bar).toHaveTextContent(`Wasted ${outcome.result.averages.wasted.toFixed(2)}`);
    expect(bar).toHaveTextContent(`Models slain ${outcome.result.averages.modelsSlain.toFixed(2)}`);
    expect(bar).toHaveTextContent('Wipe');
    fireEvent.click(screen.getByRole('button', { name: 'Full result' }));
    expect(onShow).toHaveBeenCalled();
  });

  it('says when it can’t calculate', () => {
    renderWithProviders(<ResultSummary outcome={{ error: 'No weapons' }} onShow={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Result summary' })).toHaveTextContent(
      'Can’t calculate: No weapons',
    );
  });
});
