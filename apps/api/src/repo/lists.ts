import type { ArmyList, PlayerList } from '@bcp/shared';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { armyLists, players, teams } from '../db/schema';

/** Joins a player's stored list only while it is their current BCP list. */
export const storedCurrentList = and(
  eq(armyLists.playerId, players.id),
  eq(armyLists.listId, players.listId),
);

/**
 * Players with a BCP list we have not stored: never fetched, or the player has since submitted
 * a different list (the stored one has another list id).
 */
export const isMissingList = and(isNotNull(players.listId), isNull(armyLists.playerId));

export async function findPlayersMissingLists(
  db: Db,
  eventId: string,
): Promise<{ playerId: string; listId: string }[]> {
  const rows = await db
    .select({ playerId: players.id, listId: players.listId })
    .from(players)
    .leftJoin(armyLists, storedCurrentList)
    .where(and(eq(players.eventId, eventId), isMissingList))
    .orderBy(players.id);
  return rows.flatMap(({ playerId, listId }) => (listId === null ? [] : [{ playerId, listId }]));
}

export async function saveArmyList(
  db: Db,
  playerId: string,
  list: Fetched<ArmyList>,
): Promise<void> {
  const values = { listId: list.bcpId, text: list.text, raw: list.raw, fetchedAt: new Date() };
  await db
    .insert(armyLists)
    .values({ playerId, ...values })
    .onConflictDoUpdate({ target: armyLists.playerId, set: values });
}

/** One stored army list with the context an export needs. */
export interface ExportedList {
  placing: number | null;
  player: string;
  team: string | null;
  faction: string | null;
  listId: string;
  text: string | null;
}

/** Every stored list of an event, best placing first (unplaced players last, by name). */
export async function listEventArmyLists(db: Db, eventId: string): Promise<ExportedList[]> {
  return db
    .select({
      placing: players.placing,
      player: players.name,
      team: teams.name,
      faction: players.faction,
      listId: armyLists.listId,
      text: armyLists.text,
    })
    .from(armyLists)
    .innerJoin(players, eq(players.id, armyLists.playerId))
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(eq(players.eventId, eventId))
    .orderBy(sql`${players.placing} asc nulls last`, players.name);
}

export async function findPlayerList(db: Db, playerId: string): Promise<PlayerList | null> {
  const [row] = await db
    .select({
      playerId: players.id,
      playerName: players.name,
      teamName: teams.name,
      faction: players.faction,
      listId: armyLists.listId,
      text: armyLists.text,
      fetchedAt: armyLists.fetchedAt,
    })
    .from(armyLists)
    .innerJoin(players, eq(players.id, armyLists.playerId))
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(eq(armyLists.playerId, playerId));
  return row ? { ...row, fetchedAt: row.fetchedAt.toISOString() } : null;
}
