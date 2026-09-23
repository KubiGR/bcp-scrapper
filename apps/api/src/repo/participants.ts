import type { EventCounts, EventPlayer, ListStatus, Player, Team } from '@bcp/shared';
import { and, count, eq, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { armyLists, players, teams } from '../db/schema';
import { isMissingList, storedCurrentList } from './lists';
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

function listStatusOf(bcpListId: string | null, storedListId: string | null): ListStatus {
  if (storedListId !== null) return 'fetched';
  return bcpListId === null ? 'none' : 'available';
}

/** An event's players, best placing first (unplaced last, by name), with team and list status. */
export async function listEventPlayers(db: Db, eventId: string): Promise<EventPlayer[]> {
  const rows = await db
    .select({ player: players, teamName: teams.name, storedListId: armyLists.listId })
    .from(players)
    .leftJoin(teams, eq(teams.id, players.teamId))
    .leftJoin(armyLists, eq(armyLists.playerId, players.id))
    .where(eq(players.eventId, eventId))
    .orderBy(sql`${players.placing} asc nulls last`, players.name);
  return rows.map(({ player, teamName, storedListId }) => ({
    bcpId: player.id,
    name: player.name,
    teamName,
    faction: player.faction,
    parentFaction: player.parentFaction,
    placing: player.placing,
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    dropped: player.dropped,
    listStatus: listStatusOf(player.listId, storedListId),
  }));
}

export async function countEventParticipants(db: Db, eventId: string): Promise<EventCounts> {
  const ofEvent = eq(players.eventId, eventId);
  const [playerCount, teamCount, listsAvailable, lists] = await Promise.all([
    db.$count(players, ofEvent),
    db.$count(teams, eq(teams.eventId, eventId)),
    db.$count(players, and(ofEvent, isNotNull(players.listId))),
    db
      .select({
        fetched: count(armyLists.playerId),
        missing: sql<number>`count(*) filter (where ${isMissingList})`.mapWith(Number),
      })
      .from(players)
      .leftJoin(armyLists, storedCurrentList)
      .where(ofEvent),
  ]);
  return {
    players: playerCount,
    teams: teamCount,
    listsAvailable,
    listsFetched: lists[0]?.fetched ?? 0,
    listsMissing: lists[0]?.missing ?? 0,
  };
}
