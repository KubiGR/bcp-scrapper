import { analysePairing } from '@bcp/shared';
import { fireEvent, screen, within } from '@testing-library/react';
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
      <ChainFlow
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    expect(
      screen.getByRole('group', {
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
      <ChainFlow
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    fireEvent.change(screen.getByLabelText('You send'), { target: { value: '0,1' } });
    expect(
      screen.getByRole('group', { name: /you send Space Marines \+ Emperor's Children/ }),
    ).toBeInTheDocument();
  });

  it('the final boxes are buttons a screen reader reaches, and Space picks without scrolling', () => {
    renderWithProviders(
      <ChainFlow
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    // Inside role="img" everything is presentational: the diagram must be a group instead.
    const diagram = screen.getByRole('group', { name: /Chain: you defend World Eaters/ });
    const box = within(diagram).getAllByRole('button', { name: /Final line-up/ })[0] as Element;
    expect(fireEvent.keyDown(box, { key: ' ' })).toBe(false);
    expect(screen.getByText(/^Line-up · Total/)).toBeInTheDocument();
  });

  it('the open line-up follows a rating change', () => {
    const { rerender } = renderWithProviders(
      <ChainFlow
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    const fifties = screen.getAllByRole('button', { name: 'Final line-up, total 50.0' });
    fireEvent.click(fifties.at(-1) as Element);
    // World Eaters v Death Guard goes from Y (10) to G (13).
    const changed = R1.map((row, i) => row.map((v, j) => (i === 3 && j === 1 ? 13 : v)));
    rerender(
      <ChainFlow
        analysis={analysePairing(changed)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    const panel = within(screen.getByRole('region', { name: 'Line-up' }));
    const heading = panel.getByText(/^Line-up · Total/).textContent;
    const shown = Number(/Total ([\d.]+)/.exec(heading)?.[1]);
    const games = panel
      .getAllByText(/ v /)
      .map((el) => Number(/([\d.]+)$/.exec(el.textContent)?.[1]));
    expect(games).toHaveLength(5);
    expect(shown).toBeCloseTo(
      games.reduce((s, v) => s + v, 0),
      9,
    );
    expect(shown).not.toBeCloseTo(50, 9);
  });

  it('each box lists the games formed at that step with their chips', () => {
    const analysis = analysePairing(R1);
    const ratings = ours.flatMap((o) =>
      theirs.map((t) => ({ playerId: o.id, opponentPlayerId: t.id, chip: 'G' as const })),
    );
    renderWithProviders(
      <ChainFlow analysis={analysis} ours={ours} theirs={theirs} ratings={ratings} d={3} e={4} />,
    );
    const picks = screen.getAllByText(/^Back to the pool/).length;
    const leaves = screen.getAllByRole('button', { name: /Final line-up/ }).length;
    // Round 1 locks two games per pick; round 2 locks two more and leaves the last one.
    const games = screen.getAllByRole('img', { name: / v .*: G$/ });
    expect(games).toHaveLength(picks * 2 + leaves * 3);
    expect(screen.getAllByRole('img', { name: /^Adepta Sororitas v / }).length).toBeGreaterThan(0);
  });

  it('a game nobody rated says so', () => {
    renderWithProviders(
      <ChainFlow
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    expect(screen.getAllByRole('img', { name: /: unrated$/ }).length).toBeGreaterThan(0);
  });

  it('round-2 and final boxes give their share of the step before and of the whole chain', () => {
    renderWithProviders(
      <ChainFlow
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    const leaves = screen.getAllByRole('button', { name: /Final line-up/ }).length;
    expect(screen.getAllByText(/^Total [\d.]+ · (<1|\d+)% here · (<1|\d+)% overall$/)).toHaveLength(
      leaves,
    );
    const r2 = screen.getAllByText(/^R2: you /).length;
    expect(r2).toBeGreaterThan(0);
    expect(screen.getAllByText(/^(<1|\d+)% here · (<1|\d+)% overall$/)).toHaveLength(r2);
  });

  it('each send names the attackers refused, who go back for round 2', () => {
    renderWithProviders(
      <ChainFlow
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    const sends = screen.getAllByText(/^They send .* · (<1|\d+)%$/).length;
    expect(screen.getAllByText(/^Back to the pool: .+ \(you\) · .+ \(them\)$/)).toHaveLength(sends);
  });

  it('round-2 boxes name the attackers each side sends', () => {
    renderWithProviders(
      <ChainFlow
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    const r2 = screen.getAllByText(/^R2: you /).length;
    expect(screen.getAllByText(/^They send \S.* \+ \S.*[^%]$/)).toHaveLength(r2);
    expect(screen.getAllByText(/^You send .+ \+ .+$/)).toHaveLength(r2);
  });

  it('the toggle hides what the model thinks they won’t do', () => {
    renderWithProviders(
      <ChainFlow
        analysis={analysePairing(R1)}
        ours={ours}
        theirs={theirs}
        ratings={[]}
        d={3}
        e={4}
      />,
    );
    const all = screen.getAllByRole('button', { name: /Final line-up/ }).length;
    expect(screen.getAllByText(/^0% here/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('switch', { name: /Show their unlikely choices/ }));
    expect(screen.getAllByRole('button', { name: /Final line-up/ }).length).toBeLessThan(all);
    expect(screen.queryAllByText(/(^| )(0|<1)% here/)).toHaveLength(0);
  });
});
