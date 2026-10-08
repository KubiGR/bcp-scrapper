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
    const likeliest = [...(dgOrks?.picks ?? [])].sort((a, b) => b.p - a.p)[0];
    const nodes = (likeliest?.round2 ?? []).filter((n) => n.p > 0);
    expect(nodes.length).toBeGreaterThan(0);
    // Several round-2 defenders are equally good here (the game has more than one best strategy).
    for (const node of nodes) {
      expect(node.e).toBe(3);
      // The lines the model expects; their defender picking the other way can do better for us.
      for (const leaf of node.leaves.filter((l) => l.p > 0)) expect(leaf.total).toBeCloseTo(50, 9);
    }
    expect(chain.value).toBeCloseTo(49.8, 1);
  });

  it('their defender’s pick is never assumed: both of its options are shown, however unlikely', () => {
    for (const send of chain.sends) {
      for (const weTake of new Set(send.picks.map((x) => x.weTake))) {
        const theyTake = send.picks.filter((x) => x.weTake === weTake).map((x) => x.theyTake);
        expect(theyTake.sort()).toEqual([...chain.ours].sort());
      }
      for (const pick of send.picks)
        for (const node of pick.round2)
          for (const weTake of new Set(node.leaves.map((l) => l.weTake))) {
            const theyTake = node.leaves.filter((l) => l.weTake === weTake).map((l) => l.theyTake);
            expect(theyTake.sort()).toEqual([...node.ours].sort());
          }
    }
  });

  it('their round-2 defender is never assumed: all three are shown against each of ours', () => {
    for (const send of chain.sends)
      for (const pick of send.picks) {
        for (const d of new Set(pick.round2.map((n) => n.d))) {
          const theirs = pick.round2.filter((n) => n.d === d).map((n) => n.e);
          expect(theirs).toHaveLength(3);
          expect(new Set(theirs).size).toBe(3);
        }
        expect(pick.round2.reduce((sum, n) => sum + n.p, 0) + pick.other).toBeCloseTo(1, 6);
      }
  });

  it('our own unlikely choices are there too, each step carrying both sides’ chances', () => {
    for (const send of chain.sends) {
      expect(send.picks).toHaveLength(4);
      for (const pick of send.picks) {
        expect(pick.p).toBeCloseTo(pick.ourChance * pick.theirChance, 12);
        expect(pick.round2).toHaveLength(9);
        for (const node of pick.round2) {
          expect(node.p).toBeCloseTo(node.ourChance * node.theirChance, 12);
          expect(node.leaves).toHaveLength(4);
        }
      }
    }
  });

  it('keeps every pair they could send, however unlikely, so a live pairing can follow it', () => {
    expect(chain.sends).toHaveLength(6);
    expect(chain.other).toBe(0);
    expect(chain.sends.reduce((sum, x) => sum + x.p, 0)).toBeCloseTo(1, 6);
  });
});
