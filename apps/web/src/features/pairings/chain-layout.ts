import { CHAIN_MIN_SHARE, type ChainChances, type ChainLeaf, type PairingChain } from '@bcp/shared';

export interface ChainBox {
  id: string;
  column: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'root' | 'pick' | 'round2' | 'leaf';
  /** Share of the step before. */
  share: number;
  /** Probability of reaching this step from the start. */
  reach: number;
  value: number;
  leaf?: ChainLeaf;
  ref: { send?: number; pick?: number; r2?: number; leaf?: number };
}
export interface ChainEdge {
  from: string;
  to: string;
  width: number;
}
export interface ChainLayout {
  width: number;
  height: number;
  nodes: ChainBox[];
  edges: ChainEdge[];
}

// Wide enough for the longest labels, e.g. "Emperor's Children v Adeptus Custodes" and its chip.
const COLS = [0, 190, 610, 970];
const WIDTHS = [160, 390, 330, 300];
/** Text lines are LINE apart; a pick lists its two games and who goes back, a final box its last three. */
export const LINE = 16;
const lines = (n: number) => 10 + n * LINE;
const H = { root: lines(3), pick: lines(5), round2: lines(5), leaf: lines(4) };
// The least room between stacked boxes: their ▼ and ▲ (each 10 px, half outside) and air.
const GAP = 18;
/** Room above the first box and below the last. */
const EDGE = 12;
const lineWidth = (reach: number) => Math.max(1.5, reach * 14);

/** Which unlikely choices (under 2% for that side) to show: ours, theirs. */
export interface ChainShown {
  ours: boolean;
  theirs: boolean;
}

/**
 * What has really happened in a live pairing, as far as it's got: their send (pair joined, e.g.
 * "0,2"), which of it our defender took, which of ours theirs took, and both round-2 defenders.
 */
export interface ChainFollow {
  theirSend?: string;
  weTake?: number;
  theyTake?: number;
  ourR2?: number;
  theirR2?: number;
}

/**
 * The chain to draw: only what follows the live pairing, and of the rest only the likely choices
 * (2% or more) for the sides not asked for. A followed choice shows however unlikely it is, and
 * counts as certain; their unlikely sends only when followed (all six would swamp the chain).
 */
export function visibleChain(
  chain: PairingChain,
  shown: ChainShown,
  follow: ChainFollow = {},
): PairingChain {
  const likely = (x: number) => x >= CHAIN_MIN_SHARE;
  const visible = (x: ChainChances, oursFollowed: boolean, theirsFollowed: boolean) =>
    (oursFollowed || shown.ours || likely(x.ourChance)) &&
    (theirsFollowed || shown.theirs || likely(x.theirChance));
  const keep = <T extends { p: number }>(items: T[], ok: (x: T) => boolean) => ({
    kept: items.filter(ok),
    gone: items.filter((x) => !ok(x)).reduce((sum, x) => sum + x.p, 0),
  });
  const sendsKept = keep(chain.sends, (x) =>
    follow.theirSend === undefined ? likely(x.p) : x.theirs.join() === follow.theirSend,
  );
  // A followed choice really happened: it counts as certain, so chances after it start from there.
  const given = <T extends ChainChances>(x: T, ours: boolean, theirs: boolean): T => {
    const ourChance = ours ? 1 : x.ourChance;
    const theirChance = theirs ? 1 : x.theirChance;
    return { ...x, ourChance, theirChance, p: ourChance * theirChance };
  };
  const sends = sendsKept.kept.map((followed) => {
    const send = follow.theirSend === undefined ? followed : { ...followed, p: 1 };
    const picks = keep(
      send.picks,
      (x) =>
        (follow.weTake === undefined || x.weTake === follow.weTake) &&
        (follow.theyTake === undefined || x.theyTake === follow.theyTake) &&
        visible(x, follow.weTake !== undefined, follow.theyTake !== undefined),
    );
    return {
      ...send,
      other: send.other + picks.gone,
      picks: picks.kept.map((seen) => {
        const pick = given(seen, follow.weTake !== undefined, follow.theyTake !== undefined);
        const round2 = keep(
          pick.round2,
          (x) =>
            (follow.ourR2 === undefined || x.d === follow.ourR2) &&
            (follow.theirR2 === undefined || x.e === follow.theirR2) &&
            visible(x, follow.ourR2 !== undefined, follow.theirR2 !== undefined),
        );
        return {
          ...pick,
          other: pick.other + round2.gone,
          round2: round2.kept.map((seenR2) => {
            const r2 = given(seenR2, follow.ourR2 !== undefined, follow.theirR2 !== undefined);
            const leaves = keep(r2.leaves, (x) => visible(x, false, false));
            return { ...r2, other: r2.other + leaves.gone, leaves: leaves.kept };
          }),
        };
      }),
    };
  });
  return { ...chain, sends, other: chain.other + sendsKept.gone };
}

/**
 * Left to right: our round-1 decision, their send with both picks, round-2 defenders, final line-up.
 * Leaves are stacked top to bottom; every parent sits at the middle of its children.
 */
export function layoutChain(chain: PairingChain): ChainLayout {
  const nodes: ChainBox[] = [];
  const edges: ChainEdge[] = [];
  let cursor = EDGE;
  const place = (box: Omit<ChainBox, 'x' | 'y' | 'w'> & { y?: number }): ChainBox => {
    const full: ChainBox = {
      ...box,
      x: COLS[box.column] ?? 0,
      w: WIDTHS[box.column] ?? 160,
      y: box.y ?? 0,
    };
    nodes.push(full);
    return full;
  };
  /**
   * A box taller than the boxes it leads to: its whole group (everything placed from `from`) moves
   * down by half the difference and the next group starts that much lower, so it never crowds a
   * neighbour.
   */
  const fit = (from: number, kids: ChainBox[], h: number) => {
    const first = kids[0];
    const last = kids.at(-1);
    if (!first || !last) return;
    const need = h - (last.y + last.h - first.y);
    if (need <= 0) return;
    for (const n of nodes.slice(from)) n.y += need / 2;
    cursor += need;
  };
  const middle = (kids: ChainBox[], h: number) =>
    kids.length === 0
      ? cursor
      : ((kids[0]?.y ?? 0) + ((kids.at(-1)?.y ?? 0) + (kids.at(-1)?.h ?? 0))) / 2 - h / 2;

  const pickBoxes: ChainBox[] = [];
  chain.sends.forEach((send, si) => {
    send.picks.forEach((pick, pi) => {
      const reachPick = send.p * pick.p;
      const r2Boxes: ChainBox[] = [];
      const pickFrom = nodes.length;
      pick.round2.forEach((r2, ri) => {
        const reachR2 = reachPick * r2.p;
        const r2From = nodes.length;
        const leafBoxes = r2.leaves.map((leaf, li) => {
          const box = place({
            id: `l-${si}-${pi}-${ri}-${li}`,
            column: 3,
            h: H.leaf,
            y: cursor,
            kind: 'leaf',
            share: leaf.p,
            reach: reachR2 * leaf.p,
            value: leaf.total,
            leaf,
            ref: { send: si, pick: pi, r2: ri, leaf: li },
          });
          cursor += H.leaf + GAP;
          return box;
        });
        fit(r2From, leafBoxes, H.round2);
        const r2Box = place({
          id: `r-${si}-${pi}-${ri}`,
          column: 2,
          h: H.round2,
          y: middle(leafBoxes, H.round2),
          kind: 'round2',
          share: r2.p,
          reach: reachR2,
          value: r2.value,
          ref: { send: si, pick: pi, r2: ri },
        });
        leafBoxes.forEach((l) =>
          edges.push({ from: r2Box.id, to: l.id, width: lineWidth(l.reach) }),
        );
        r2Boxes.push(r2Box);
        cursor += GAP / 2;
      });
      fit(pickFrom, r2Boxes, H.pick);
      const pickBox = place({
        id: `p-${si}-${pi}`,
        column: 1,
        h: H.pick,
        y: middle(r2Boxes, H.pick),
        kind: 'pick',
        share: send.p * pick.p,
        reach: reachPick,
        value: pick.value,
        ref: { send: si, pick: pi },
      });
      r2Boxes.forEach((r) => edges.push({ from: pickBox.id, to: r.id, width: lineWidth(r.reach) }));
      pickBoxes.push(pickBox);
      cursor += GAP;
    });
  });
  const root = place({
    id: 'root',
    column: 0,
    h: H.root,
    y: Math.max(EDGE, middle(pickBoxes, H.root)),
    kind: 'root',
    share: 1,
    reach: 1,
    value: chain.value,
    ref: {},
  });
  pickBoxes.forEach((p) => edges.push({ from: root.id, to: p.id, width: lineWidth(p.reach) }));
  const height = Math.max(...nodes.map((n) => n.y + n.h), H.root) + EDGE;
  return { width: (COLS[3] ?? 0) + (WIDTHS[3] ?? 0), height, nodes, edges };
}
