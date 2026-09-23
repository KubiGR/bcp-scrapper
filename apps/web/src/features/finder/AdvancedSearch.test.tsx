import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { AdvancedSearch } from './AdvancedSearch';
import { FinderSearchSchema } from './finder-search';

const window = { from: '2026-01-01', to: '2026-02-01' };
const deepSearch = (extra: Record<string, string> = {}) =>
  FinderSearchSchema.parse({ from: window.from, to: window.to, ...extra });

afterEach(() => {
  vi.useRealTimers();
});

describe('AdvancedSearch', () => {
  it('writes the name to the URL after a pause, without adding a history entry', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    renderWithProviders(
      <AdvancedSearch search={deepSearch()} window={window} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' GT ' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith({ q: 'GT' }, { replace: true });
  });

  it('follows the URL, so going back or to the latest view clears the text fields', () => {
    const { rerender } = renderWithProviders(
      <AdvancedSearch
        search={deepSearch({ q: 'Open', country: 'Germany' })}
        window={window}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Open');
    expect(screen.getByLabelText('Country')).toHaveValue('Germany');

    rerender(<AdvancedSearch search={deepSearch()} window={window} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Country')).toHaveValue('');
  });

  it('clears the dates and the text filters when going back to the latest view', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <AdvancedSearch search={deepSearch({ q: 'Open' })} window={window} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to latest' }));
    // toStrictEqual: the cleared keys must be present (as undefined), not just absent.
    expect(onChange.mock.calls[0]?.[0]).toStrictEqual({
      from: undefined,
      to: undefined,
      q: undefined,
      country: undefined,
    });
  });
});
