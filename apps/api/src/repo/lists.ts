import {
  parseArmyList,
  PARSER_VERSION,
  splitDetachments,
  type ArmyList,
  type PlayerList,
} from '@bcp/shared';
import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
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

/**
 * Detachments seen on their own: every name of a list naming several, and a list's single name
 * when it has no joiner (a joined "A and B" is what splitting decides about).
 */
export async function knownDetachments(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ detachments: armyLists.detachments })
    .from(armyLists)
    .where(sql`cardinality(${armyLists.detachments}) > 0`);
  const known = new Set<string>();
  for (const { detachments } of rows) {
    if (detachments.length > 1) detachments.forEach((name) => known.add(name));
    else if (detachments[0] !== undefined && !/,|\s(?:and|y|und|et|e)\s/.test(detachments[0])) {
      known.add(detachments[0]);
    }
  }
  return known;
}

/** The parsed columns for a list's text, splitting joined detachments against `known`. */
function parsedColumns(text: string | null, known: ReadonlySet<string>) {
  const parsed = parseArmyList(text);
  return {
    parsedArmy: parsed.army,
    detachments: splitDetachments(parsed.detachments, known),
    parsedDisposition: parsed.disposition,
    parserVersion: PARSER_VERSION,
  };
}

export async function saveArmyList(
  db: Db,
  playerId: string,
  list: Fetched<ArmyList>,
): Promise<void> {
  const values = {
    listId: list.bcpId,
    text: list.text,
    raw: list.raw,
    fetchedAt: new Date(),
    ...parsedColumns(list.text, await knownDetachments(db)),
  };
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

/** A player an export has no list for, and why. */
export interface MissingList {
  player: string;
  team: string | null;
  reason: 'no list on BCP' | 'not fetched';
}

/** An event's players without a stored list, best placing first (unplaced last, by name). */
export async function listEventMissingLists(db: Db, eventId: string): Promise<MissingList[]> {
  const rows = await db
    .select({ player: players.name, team: teams.name, listId: players.listId })
    .from(players)
    .leftJoin(armyLists, eq(armyLists.playerId, players.id))
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(and(eq(players.eventId, eventId), isNull(armyLists.playerId)))
    .orderBy(sql`${players.placing} asc nulls last`, players.name);
  return rows.map(({ player, team, listId }) => ({
    player,
    team,
    reason: listId === null ? 'no list on BCP' : 'not fetched',
  }));
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

const REPARSE_BATCH = 200;

/**
 * Re-reads lists parsed by an older parser (no BCP requests), then splits joined detachments now
 * that every list's single detachments are known. Returns how many lists were re-read.
 */
export async function reparseLists(db: Db, logger: Logger): Promise<number> {
  let reparsed = 0;
  for (;;) {
    const batch = await db
      .select({ playerId: armyLists.playerId, text: armyLists.text })
      .from(armyLists)
      .where(lt(armyLists.parserVersion, PARSER_VERSION))
      .limit(REPARSE_BATCH);
    if (batch.length === 0) break;
    for (const { playerId, text } of batch) {
      await db
        .update(armyLists)
        .set(parsedColumns(text, new Set()))
        .where(eq(armyLists.playerId, playerId));
    }
    reparsed += batch.length;
    logger.debug({ reparsed }, 'Re-reading stored army lists');
  }

  const known = await knownDetachments(db);
  const single = await db
    .select({ playerId: armyLists.playerId, detachments: armyLists.detachments })
    .from(armyLists)
    .where(sql`cardinality(${armyLists.detachments}) = 1`);
  for (const { playerId, detachments } of single) {
    const split = splitDetachments(detachments, known);
    if (split.length > 1) {
      await db
        .update(armyLists)
        .set({ detachments: split })
        .where(eq(armyLists.playerId, playerId));
    }
  }
  return reparsed;
}
