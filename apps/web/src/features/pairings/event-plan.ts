import { shortList, type EventPlayer, type PairingRosterPlayer } from '@bcp/shared';
import type { SheetPlan } from './sheet-plan';

/** An event's teams with how many players are still in (pairings need five). */
export function teamsOf(players: EventPlayer[]): { id: string; name: string; players: number }[] {
  const teams = new Map<string, { id: string; name: string; players: number }>();
  for (const p of players) {
    if (p.dropped || p.teamId === null) continue;
    const team = teams.get(p.teamId) ?? { id: p.teamId, name: p.teamName ?? p.teamId, players: 0 };
    team.players += 1;
    teams.set(p.teamId, team);
  }
  return [...teams.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Our team against theirs as the planner's players: army, detachments, disposition and the short
 * list (from `lists`, the list text by player; none while a list isn't fetched). No ratings yet.
 */
export function planFromEvent(
  players: EventPlayer[],
  lists: Map<string, string | null>,
  team: string,
  opponent: string,
  event: string,
): SheetPlan {
  const roster = (teamId: string): PairingRosterPlayer[] =>
    players
      .filter((p) => p.teamId === teamId && !p.dropped)
      .map((p) => {
        const units = shortList(lists.get(p.bcpId) ?? null);
        return {
          id: p.bcpId,
          name: p.name,
          faction: p.faction,
          detachments: p.detachments,
          disposition: p.disposition,
          list: units.length > 0 ? units.join('\n') : null,
        };
      });
  return {
    ours: roster(team),
    theirs: roster(opponent),
    ratings: [],
    source: { event, team, opponent },
  };
}
