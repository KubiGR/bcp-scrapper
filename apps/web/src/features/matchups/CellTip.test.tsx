import { act, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { CellTip, type CellTipHandle } from './CellTip';

const rect = (top: number, height: number) =>
  ({
    top,
    bottom: top + height,
    left: 100,
    right: 140,
    width: 40,
    height,
    x: 100,
    y: top,
  }) as DOMRect;

/** A table whose heading ends at y = 150, with a cell at `top`. */
function setup(top: number) {
  const tip = createRef<CellTipHandle>();
  renderWithProviders(
    <>
      <CellTip ref={tip} />
      <table>
        <thead>
          <tr>
            <th>Orks</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-testid="cell">50</td>
          </tr>
        </tbody>
      </table>
    </>,
  );
  const thead = document.querySelector('thead');
  if (thead === null) throw new Error('no thead');
  thead.getBoundingClientRect = () => rect(0, 150);
  const cell = screen.getByTestId('cell');
  cell.getBoundingClientRect = () => rect(top, 36);
  act(() => {
    tip.current?.show('Orks vs Necrons: 50%', cell);
  });
  return screen.getByRole('tooltip');
}

describe('CellTip', () => {
  it('sits above a cell with room above it', () => {
    expect(setup(400)).toHaveAttribute('data-placement', 'above');
  });

  it('drops below a cell right under the headings, which would cover it', () => {
    const tip = setup(152);
    expect(tip).toHaveAttribute('data-placement', 'below');
    expect(tip.style.top).toBe('188px');
  });
});
