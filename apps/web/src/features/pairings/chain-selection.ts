import type { ChainLeaf, PairingChain, PairingRosterPlayer } from '@bcp/shared';
import type { ChainLayout } from './chain-layout';

export interface LineupSelection {
  lineupKey: string;
  pathKey: string;
}

interface LineupOption extends LineupSelection {
  nodeId: string;
  leaf: ChainLeaf;
}

/** One option per visible leaf. Paths remember the order of picks and both opening sends. */
export function visibleLineups(
  layout: ChainLayout,
  chain: PairingChain,
  ours: PairingRosterPlayer[],
  theirs: PairingRosterPlayer[],
): LineupOption[] {
  return layout.nodes.flatMap(({ id, leaf, ref }) => {
    const send = ref.send === undefined ? undefined : chain.sends[ref.send];
    if (!leaf || !send) return [];
    const games = leaf.games.map(([a, b]) => JSON.stringify([ours[a]?.id, theirs[b]?.id]));
    return [
      {
        nodeId: id,
        leaf,
        lineupKey: JSON.stringify([...games].sort()),
        pathKey: JSON.stringify([
          chain.ours.map((a) => ours[a]?.id).sort(),
          send.theirs.map((b) => theirs[b]?.id).sort(),
          games,
        ]),
      },
    ];
  });
}

export function resolveLineup(options: LineupOption[], selection: LineupSelection | null) {
  if (!selection) return undefined;
  return (
    options.find((option) => option.pathKey === selection.pathKey) ??
    options.find((option) => option.lineupKey === selection.lineupKey)
  );
}

export function pathToLeaf(edges: ChainLayout['edges'], leafId: string | undefined) {
  const parentByNode = new Map(edges.map(({ from, to }) => [to, from]));
  const path = new Set<string>();
  for (let id = leafId; id !== undefined; id = parentByNode.get(id)) path.add(id);
  return path;
}
