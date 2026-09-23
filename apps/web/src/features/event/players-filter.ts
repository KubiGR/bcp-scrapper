import type { EventPlayer } from '@bcp/shared';

export interface PlayerFilter {
  query: string;
  faction: string | null;
}

/** Players whose name or team contains the query (case-insensitive), in the chosen faction. */
export function filterPlayers(
  players: EventPlayer[],
  { query, faction }: PlayerFilter,
): EventPlayer[] {
  const needle = query.trim().toLocaleLowerCase();
  const matchesText = (player: EventPlayer) =>
    needle === '' ||
    player.name.toLocaleLowerCase().includes(needle) ||
    (player.teamName?.toLocaleLowerCase().includes(needle) ?? false);
  return players.filter(
    (player) => (faction === null || player.faction === faction) && matchesText(player),
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
