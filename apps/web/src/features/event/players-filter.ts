import { qualifiesForMaxLosses, type EventPlayer } from '@bcp/shared';

export interface PlayerFilter {
  query: string;
  faction: string | null;
  maxLosses: number | null;
}

/** Players whose name or team contains the query (case-insensitive), in the chosen faction. */
export function filterPlayers(
  players: EventPlayer[],
  { query, faction, maxLosses }: PlayerFilter,
): EventPlayer[] {
  const needle = query.trim().toLocaleLowerCase();
  const matchesText = (player: EventPlayer) =>
    needle === '' ||
    player.name.toLocaleLowerCase().includes(needle) ||
    (player.teamName?.toLocaleLowerCase().includes(needle) ?? false);
  return players.filter(
    (player) =>
      (faction === null || player.faction === faction) &&
      matchesText(player) &&
      (maxLosses === null || qualifiesForMaxLosses(player, maxLosses)),
  );
}

/** The factions present, alphabetically, for the faction filter. */
export function factionsOf(players: EventPlayer[]): string[] {
  const factions = new Set(players.flatMap((player) => (player.faction ? [player.faction] : [])));
  return [...factions].sort((a, b) => a.localeCompare(b));
}

export function formatRecord(player: Pick<EventPlayer, 'wins' | 'losses' | 'draws'>): string {
  return `${player.wins}-${player.losses}-${player.draws}`;
}

/** Offered result filters: X-0 up to X-(rounds-1), never more than X-5. */
export function lossOptions(roundCount: number): number[] {
  const highest = Math.min(roundCount - 1, 5);
  return Array.from({ length: Math.max(highest + 1, 0) }, (_, losses) => losses);
}

/** Lists a queue request would add: not fetched yet (or failed), passing the loss limit if any. */
export function missingListCount(players: EventPlayer[], maxLosses: number | null): number {
  return players.filter(
    (player) =>
      (player.listStatus === 'available' || player.listStatus === 'failed') &&
      (maxLosses === null || qualifiesForMaxLosses(player, maxLosses)),
  ).length;
}

export const lossLabel = (losses: number) => (losses === 0 ? 'X-0 only' : `X-${losses} or better`);
