import { analysePairing, pairingChain } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { layoutChain, visibleChain } from './chain-layout';

const R1 = [
  [17, 10, 10, 7, 13],
  [10, 13, 2.5, 13, 11.5],
  [7, 13, 10, 7, 2.5],
  [13, 10, 7, 13, 11.5],
  [13, 7, 10, 2.5, 13],
];

describe('layoutChain', () => {
  const chain = pairingChain(analysePairing(R1), 3, 4, [1, 4]);
  const layout = layoutChain(chain);

  it('one box per step in four columns, every box but the first with one incoming line', () => {
    expect(layout.nodes.filter((n) => n.kind === 'root')).toHaveLength(1);
    const leaves = chain.sends.flatMap((s) =>
      s.picks.flatMap((p) => p.round2.flatMap((r) => r.leaves)),
    );
    expect(layout.nodes.filter((n) => n.kind === 'leaf')).toHaveLength(leaves.length);
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    expect(new Set(layout.nodes.map((n) => n.column))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('boxes in a column never overlap, and likelier steps get thicker lines', () => {
    for (const col of [1, 2, 3]) {
      const boxes = layout.nodes.filter((n) => n.column === col).sort((a, b) => a.y - b.y);
      boxes.slice(1).forEach((b, i) => {
        expect(b.y).toBeGreaterThanOrEqual((boxes[i]?.y ?? 0) + (boxes[i]?.h ?? 0));
      });
    }
    const picks = layout.nodes.filter((n) => n.kind === 'pick').sort((a, b) => b.reach - a.reach);
    const width = (id: string) => layout.edges.find((e) => e.to === id)?.width ?? 0;
    expect(width(picks[0]?.id ?? '')).toBeGreaterThan(width(picks[picks.length - 1]?.id ?? ''));
  });

  it('the first box is narrow so the whole chain fits a wide screen', () => {
    const root = layout.nodes.find((n) => n.kind === 'root');
    expect(root?.w).toBeLessThanOrEqual(160);
    expect(layout.width).toBeLessThanOrEqual(1270);
  });

  it('leaves room at the top and at least 18 px between boxes in a column, even when a box is taller than what it leads to', () => {
    // Every pick, defender and line-up shown: round-2 boxes with a single line-up are the tight case.
    const all = layoutChain(pairingChain(analysePairing(R1), 0, 4, [1, 4]));
    expect(Math.min(...all.nodes.map((n) => n.y))).toBeGreaterThanOrEqual(12);
    for (const col of [0, 1, 2, 3]) {
      const boxes = all.nodes.filter((n) => n.column === col).sort((a, b) => a.y - b.y);
      boxes.slice(1).forEach((b, i) => {
        const above = boxes[i];
        expect(b.y - ((above?.y ?? 0) + (above?.h ?? 0))).toBeGreaterThanOrEqual(18);
      });
    }
    expect(all.height).toBeGreaterThanOrEqual(Math.max(...all.nodes.map((n) => n.y + n.h)) + 12);
  });

  it('shows only their likely sends unless one is followed, and a followed choice shows however unlikely', () => {
    const full = pairingChain(analysePairing(R1), 3, 4, [1, 4]);
    const shown = { ours: false, theirs: false };
    expect(visibleChain(full, shown, {}).sends.every((x) => x.p >= 0.02)).toBe(true);
    const unlikely = full.sends.find((x) => x.p < 0.02);
    if (!unlikely) throw new Error('every send is likely');
    const followed = visibleChain(full, shown, { theirSend: unlikely.theirs.join() });
    expect(followed.sends.map((x) => x.theirs)).toEqual([unlikely.theirs]);
    // What happened is certain: chances after it count from there.
    expect(followed.sends[0]?.p).toBe(1);
    // The sends that didn't happen are not "other lines".
    expect(followed.other).toBe(0);
  });

  it('following the picks and round-2 defenders keeps only that branch', () => {
    const full = pairingChain(analysePairing(R1), 3, 4, [1, 4]);
    const send = full.sends[0];
    const pick =
      send?.picks.find((x) => x.ourChance < 0.02 && x.theirChance < 0.02) ?? send?.picks[0];
    const r2 = pick?.round2.at(-1);
    if (!send || !pick || !r2) throw new Error('no branch');
    const follow = {
      theirSend: send.theirs.join(),
      weTake: pick.weTake,
      theyTake: pick.theyTake,
      ourR2: r2.d,
      theirR2: r2.e,
    };
    const only = visibleChain(full, { ours: false, theirs: false }, follow);
    expect(only.sends).toHaveLength(1);
    expect(only.sends[0]?.picks.map((x) => [x.weTake, x.theyTake])).toEqual([
      [pick.weTake, pick.theyTake],
    ]);
    expect(only.sends[0]?.picks[0]?.round2.map((x) => [x.d, x.e])).toEqual([[r2.d, r2.e]]);
    expect(only.sends[0]?.picks[0]?.p).toBe(1);
    expect(only.sends[0]?.picks[0]?.round2[0]?.p).toBe(1);
  });

  it('following the round-2 picks leaves the one final line-up', () => {
    const full = pairingChain(analysePairing(R1), 3, 4, [1, 4]);
    const send = full.sends[0];
    const pick = send?.picks[0];
    const r2 = pick?.round2[0];
    const leaf = r2?.leaves.at(-1);
    if (!send || !pick || !r2 || !leaf) throw new Error('no branch');
    const only = visibleChain(
      full,
      { ours: false, theirs: false },
      {
        theirSend: send.theirs.join(),
        weTake: pick.weTake,
        theyTake: pick.theyTake,
        ourR2: r2.d,
        theirR2: r2.e,
        weTake2: leaf.weTake,
        theyTake2: leaf.theyTake,
      },
    );
    const leaves = only.sends[0]?.picks[0]?.round2[0]?.leaves ?? [];
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.games).toEqual(leaf.games);
    expect(leaves[0]?.p).toBe(1);
  });
});
