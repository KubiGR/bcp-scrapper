import { describe, expect, it } from 'vitest';
import { pairingChain } from './chain';
import { analysePairing } from './pairing';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];

describe('pairingChain', () => {
  const chain = pairingChain(analysePairing(R1), 3, 4, [1, 4]); // WE v Custodes, send EC + Sororitas

  it('each level shares add up to 1 with what was folded away', () => {
    const sum = chain.sends.reduce((s, b) => s + b.p, 0) + chain.other;
    expect(sum).toBeCloseTo(1, 6);
    for (const send of chain.sends) {
      expect(send.picks.reduce((s, x) => s + x.p, 0) + send.other).toBeCloseTo(1, 6);
      for (const pick of send.picks)
        expect(pick.round2.reduce((s, n) => s + n.p, 0) + pick.other).toBeCloseTo(1, 6);
    }
  });

  it('every line-up has five games, each player once on each side', () => {
    for (const send of chain.sends)
      for (const pick of send.picks)
        for (const node of pick.round2)
          for (const leaf of node.leaves) {
            expect(new Set(leaf.games.map((g) => g[0])).size).toBe(5);
            expect(new Set(leaf.games.map((g) => g[1])).size).toBe(5);
            expect(leaf.total).toBeCloseTo(
              leaf.games.reduce((s, [a, b]) => s + (R1[a]?.[b] ?? 0), 0),
              9,
            );
          }
  });

  it('matches the spreadsheet analysis: DG + Orks 66%, then CSM defends in round 2 and every line-up totals 50', () => {
    const dgOrks = chain.sends.find((s) => s.theirs.join() === '1,2');
    expect(dgOrks?.p).toBeCloseTo(0.657, 2);
    const nodes = dgOrks?.picks[0]?.round2 ?? [];
    expect(nodes.length).toBeGreaterThan(0);
    // Several round-2 defenders are equally good here (the game has more than one best strategy).
    for (const node of nodes) {
      expect(node.e).toBe(3);
      for (const leaf of node.leaves) expect(leaf.total).toBeCloseTo(50, 9);
    }
    expect(chain.value).toBeCloseTo(49.8, 1);
  });
});
