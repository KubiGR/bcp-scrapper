import type { ChainLeaf, PairingChain } from '@bcp/shared';

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
const COLS = [0, 210, 630, 930];
const WIDTHS = [180, 390, 270, 300];
/** Text lines are LINE apart; a pick lists its two games and who goes back, a final box its last three. */
export const LINE = 16;
const lines = (n: number) => 10 + n * LINE;
const H = { root: lines(3), pick: lines(5), round2: lines(3), leaf: lines(4) };
const GAP = 8;
const lineWidth = (reach: number) => Math.max(1.5, reach * 14);

/**
 * Left to right: our round-1 decision, their send with both picks, round-2 defenders, final line-up.
 * Leaves are stacked top to bottom; every parent sits at the middle of its children.
 */
export function layoutChain(chain: PairingChain): ChainLayout {
  const nodes: ChainBox[] = [];
  const edges: ChainEdge[] = [];
  let cursor = 0;
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
  const middle = (kids: ChainBox[], h: number) =>
    kids.length === 0
      ? cursor
      : ((kids[0]?.y ?? 0) + ((kids.at(-1)?.y ?? 0) + (kids.at(-1)?.h ?? 0))) / 2 - h / 2;

  const pickBoxes: ChainBox[] = [];
  chain.sends.forEach((send, si) => {
    send.picks.forEach((pick, pi) => {
      const reachPick = send.p * pick.p;
      const r2Boxes: ChainBox[] = [];
      pick.round2.forEach((r2, ri) => {
        const reachR2 = reachPick * r2.p;
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
        cursor += GAP;
      });
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
      cursor += GAP * 2;
    });
  });
  const root = place({
    id: 'root',
    column: 0,
    h: H.root,
    y: Math.max(0, middle(pickBoxes, H.root)),
    kind: 'root',
    share: 1,
    reach: 1,
    value: chain.value,
    ref: {},
  });
  pickBoxes.forEach((p) => edges.push({ from: root.id, to: p.id, width: lineWidth(p.reach) }));
  const height = Math.max(...nodes.map((n) => n.y + n.h), H.root);
  return { width: (COLS[3] ?? 0) + (WIDTHS[3] ?? 0), height, nodes, edges };
}
