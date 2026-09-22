import type { Player, Team } from '@bcp/shared';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { players, teams } from '../db/schema';
import { excludedColumns } from './upsert';

export async function upsertTeams(db: Db, list: Fetched<Team>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(teams)
    .values(
      list.map((team) => ({
        id: team.bcpId,
        eventId: team.eventBcpId,
        name: team.name,
        placing: team.placing,
        roundPoints: team.roundPoints,
        raw: team.raw,
      })),
    )
    .onConflictDoUpdate({ target: teams.id, set: excludedColumns(teams, ['id', 'createdAt']) });
}

export async function upsertPlayers(db: Db, list: Fetched<Player>[]): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(players)
    .values(
      list.map((player) => ({
        id: player.bcpId,
        eventId: player.eventBcpId,
        teamId: player.teamBcpId,
        name: player.name,
        faction: player.faction,
        parentFaction: player.parentFaction,
        placing: player.placing,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        dropped: player.dropped,
        listId: player.listBcpId,
        raw: player.raw,
      })),
    )
    .onConflictDoUpdate({ target: players.id, set: excludedColumns(players, ['id', 'createdAt']) });
}
