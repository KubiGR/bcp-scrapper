import { qualifiesForMaxLosses, type EventPlayer } from '@bcp/shared';

/** An empty `factions`/`dispositions` list means no filter; otherwise any listed value matches. */
export interface PlayerFilter {
  query: string;
  factions: string[];
  dispositions: string[];
  maxLosses: number | null;
}

const anyOf = (chosen: string[], value: string | null) =>
  chosen.length === 0 || (value !== null && chosen.includes(value));

/**
 * Players whose name or team contains the query (case-insensitive), in any chosen faction and any
 * chosen disposition, within the loss limit. Filters combine with AND.
 */
export function filterPlayers(
  players: EventPlayer[],
  { query, factions, dispositions, maxLosses }: PlayerFilter,
): EventPlayer[] {
  const needle = query.trim().toLocaleLowerCase();
  const matchesText = (player: EventPlayer) =>
    needle === '' ||
    player.name.toLocaleLowerCase().includes(needle) ||
    (player.teamName?.toLocaleLowerCase().includes(needle) ?? false);
  return players.filter(
    (player) =>
      anyOf(factions, player.faction) &&
      anyOf(dispositions, player.disposition) &&
      matchesText(player) &&
      (maxLosses === null || qualifiesForMaxLosses(player, maxLosses)),
  );
}

/** The factions present, alphabetically, for the faction filter. */
export function factionsOf(players: EventPlayer[]): string[] {
  const factions = new Set(players.flatMap((player) => (player.faction ? [player.faction] : [])));
  return [...factions].sort((a, b) => a.localeCompare(b));
}

/** The dispositions present, alphabetically, for the disposition filter. */
export function dispositionsOf(players: EventPlayer[]): string[] {
  const dispositions = new Set(
    players.flatMap((player) => (player.disposition ? [player.disposition] : [])),
  );
  return [...dispositions].sort((a, b) => a.localeCompare(b));
}

export function formatRecord(player: Pick<EventPlayer, 'wins' | 'losses' | 'draws'>): string {
  return `${player.wins}-${player.losses}-${player.draws}`;
}

/** Offered result filters: X-0 up to X-(rounds-1), never more than X-5. */
export function lossOptions(roundCount: number): number[] {
  const highest = Math.min(roundCount - 1, 5);
  return Array.from({ length: Math.max(highest + 1, 0) }, (_, losses) => losses);
}

/**
 * Lists a queue request would add: not fetched yet (or failed, except "no list on BCP", which the
 * server doesn't queue in bulk), passing the loss limit if any.
 */
export function missingListCount(players: EventPlayer[], maxLosses: number | null): number {
  return players.filter(
    (player) =>
      (player.listStatus === 'available' ||
        (player.listStatus === 'failed' && player.listErrorCode !== 'NO_LIST')) &&
      (maxLosses === null || qualifiesForMaxLosses(player, maxLosses)),
  ).length;
}

/** Missing lists among the players of the chosen teams (same rule as `missingListCount`). */
export function missingListCountFor(players: EventPlayer[], teamIds: Set<string>): number {
  return missingListCount(
    players.filter((player) => player.teamId !== null && teamIds.has(player.teamId)),
    null,
  );
}

export const lossLabel = (losses: number) => (losses === 0 ? 'X-0 only' : `X-${losses} or better`);

export interface PlayerGroup {
  teamId: string | null;
  teamName: string;
  teamPlacing: number | null;
  players: EventPlayer[];
}

/**
 * Players grouped by team, teams in BCP placing order (unplaced teams after, by name), players
 * without a team last. Player order within a group is kept.
 */
export function groupPlayersByTeam(players: EventPlayer[]): PlayerGroup[] {
  const groups = new Map<string | null, PlayerGroup>();
  for (const player of players) {
    const group = groups.get(player.teamId) ?? {
      teamId: player.teamId,
      teamName: player.teamId === null ? 'No team' : (player.teamName ?? 'Unknown team'),
      teamPlacing: player.teamPlacing,
      players: [],
    };
    group.players.push(player);
    groups.set(player.teamId, group);
  }
  const rank = (group: PlayerGroup) =>
    group.teamId === null ? 2 : group.teamPlacing === null ? 1 : 0;
  return [...groups.values()].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.teamPlacing ?? 0) - (b.teamPlacing ?? 0) ||
      a.teamName.localeCompare(b.teamName),
  );
}
