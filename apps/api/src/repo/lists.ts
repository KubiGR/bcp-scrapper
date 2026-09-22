import type { ArmyList } from '@bcp/shared';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import { armyLists, players } from '../db/schema';

/** Players whose BCP list id we know but whose list text we have not stored yet. */
export async function findPlayersMissingLists(
  db: Db,
  eventId: string,
): Promise<{ playerId: string; listId: string }[]> {
  const rows = await db
    .select({ playerId: players.id, listId: players.listId })
    .from(players)
    .leftJoin(armyLists, eq(armyLists.playerId, players.id))
    .where(and(eq(players.eventId, eventId), isNotNull(players.listId), isNull(armyLists.playerId)))
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
