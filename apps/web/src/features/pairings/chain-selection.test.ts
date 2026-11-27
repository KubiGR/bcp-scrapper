import { analysePairing, pairingChain, type PairingRosterPlayer } from '@bcp/shared';
import { expect, it } from 'vitest';
import { layoutChain } from './chain-layout';
import { pathToLeaf, resolveLineup, visibleLineups } from './chain-selection';

it('keeps the clicked path through reordering and falls back by lineup when needed', () => {
  const roster = (side: string): PairingRosterPlayer[] =>
    Array.from({ length: 5 }, (_, i) => ({
      id: `${side}-${i}`,
      name: '',
      faction: null,
      detachments: [],
      list: null,
    }));
  const build = (points: number) =>
    pairingChain(analysePairing(roster('ours').map(() => [points, 10, 10, 10, 10])), 0, 0, [1, 2]);
  const ours = roster('ours');
  const theirs = roster('theirs');
  const original = build(10);
  const originalLayout = layoutChain(original);
  const options = visibleLineups(originalLayout, original, ours, theirs);
  const clicked = options.find((option, i) =>
    options.slice(0, i).some((other) => other.lineupKey === option.lineupKey),
  );
  if (!clicked) throw new Error('Expected multiple paths to a lineup');

  const changed = build(13);
  const reordered = { ...changed, sends: [...changed.sends].reverse() };
  const nextLayout = layoutChain(reordered);
  const nextOptions = visibleLineups(nextLayout, reordered, ours, theirs);
  const exact = resolveLineup(nextOptions, clicked);
  expect(exact?.pathKey).toBe(clicked.pathKey);
  expect(exact?.nodeId).not.toBe(clicked.nodeId);
  expect(exact?.leaf.total).toBe(53);
  expect([...pathToLeaf(nextLayout.edges, exact?.nodeId)]).toHaveLength(4);

  const remaining = nextOptions.filter((option) => option.pathKey !== clicked.pathKey);
  const fallback = resolveLineup(remaining, clicked);
  expect(fallback?.lineupKey).toBe(clicked.lineupKey);
  expect(fallback?.pathKey).not.toBe(clicked.pathKey);

  const missing = remaining.filter((option) => option.lineupKey !== clicked.lineupKey);
  expect(resolveLineup(missing, clicked)).toBeUndefined();
});
