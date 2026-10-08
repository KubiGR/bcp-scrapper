import { analysePairing } from '@bcp/shared';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { ChainFlow } from './ChainFlow';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];
const names = (xs: string[]) =>
  xs.map((faction, i) => ({ id: `${i}`, name: `P${i}`, faction, detachments: [], list: null }));
const ours = names([
  'Space Marines',
  "Emperor's Children",
  'Chaos Daemons',
  'World Eaters',
  'Adepta Sororitas',
]);
const theirs = names([
  'Grey Knights',
  'Death Guard',
  'Orks',
  'Chaos Space Marines',
  'Adeptus Custodes',
]);

describe('ChainFlow', () => {
  it('draws the chain for the best send and shows a line-up when a final box is clicked', () => {
    renderWithProviders(
      <ChainFlow analysis={analysePairing(R1)} ours={ours} theirs={theirs} d={3} e={4} />,
    );
    expect(
      screen.getByRole('img', {
        name: /Chain: you defend World Eaters, they defend Adeptus Custodes/,
      }),
    ).toBeInTheDocument();
    // The last line-up totalling 50 is the Death Guard + Orks branch (drawn below Grey Knights + Orks).
    const fifties = screen.getAllByRole('button', { name: 'Final line-up, total 50.0' });
    fireEvent.click(fifties.at(-1) as Element);
    expect(screen.getByText('Line-up · Total 50.0')).toBeInTheDocument();
    expect(screen.getAllByText(/World Eaters v Death Guard/).length).toBeGreaterThan(0);
  });

  it('redraws for another send', () => {
    renderWithProviders(
      <ChainFlow analysis={analysePairing(R1)} ours={ours} theirs={theirs} d={3} e={4} />,
    );
    fireEvent.change(screen.getByLabelText('You send'), { target: { value: '0,1' } });
    expect(
      screen.getByRole('img', { name: /you send Space Marines \+ Emperor's Children/ }),
    ).toBeInTheDocument();
  });
});
