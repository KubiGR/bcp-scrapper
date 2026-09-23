import type { Player, Team } from '@bcp/shared';
import { and, eq, notInArray } from 'drizzle-orm';
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

/**
 * Makes an event's stored teams match BCP's active list: upserts it, then deletes the event's
 * teams it no longer contains. An empty list deletes nothing (BCP may have hiccuped).
 */
export async function replaceEventTeams(
  db: Db,
  eventId: string,
  list: Fetched<Team>[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await upsertTeams(tx, list);
    if (list.length === 0) return;
    const keep = list.map((team) => team.bcpId);
    await tx.delete(teams).where(and(eq(teams.eventId, eventId), notInArray(teams.id, keep)));
  });
}

/**
 * Like replaceEventTeams, for players. Deleting a player also deletes its stored army list.
 */
export async function replaceEventPlayers(
  db: Db,
  eventId: string,
  list: Fetched<Player>[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await upsertPlayers(tx, list);
    if (list.length === 0) return;
    const keep = list.map((player) => player.bcpId);
    await tx.delete(players).where(and(eq(players.eventId, eventId), notInArray(players.id, keep)));
  });
}
