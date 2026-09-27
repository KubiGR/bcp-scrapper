import {
  parseArmyList,
  PARSER_VERSION,
  cleanDetachmentName,
  detachmentParts,
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

/** What the stored lists say about detachment names. */
interface DetachmentVocabulary {
  /** Names known to be single detachments: taken alone, or named in a comma list. */
  known: Set<string>;
  /** Lower-case name → its most common spelling. */
  spellings: Map<string, string>;
}

/**
 * Learns detachment names from every stored list. A line without "and"-type joiners is one name;
 * a comma list names its detachments (commas never occur inside a name); "A and B" teaches
 * nothing on its own, since a single name may contain "and".
 */
async function detachmentVocabulary(db: Db): Promise<DetachmentVocabulary> {
  const rows = await db
    .select({ detachments: armyLists.detachments })
    .from(armyLists)
    .where(sql`cardinality(${armyLists.detachments}) > 0`);
  const known = new Set<string>();
  const counts = new Map<string, Map<string, number>>();
  const learn = (name: string) => {
    known.add(name);
    const spelled = counts.get(name.toLowerCase()) ?? new Map<string, number>();
    spelled.set(name, (spelled.get(name) ?? 0) + 1);
    counts.set(name.toLowerCase(), spelled);
  };
  for (const { detachments } of rows) {
    const names = detachments.map(cleanDetachmentName);
    if (names.length > 1) {
      names.forEach(learn);
      continue;
    }
    for (const piece of (names[0] ?? '').split(/\s*,\s*/)) {
      const words = detachmentParts(piece);
      // A piece without joiners is a name; "A and B" might be one name or two: learn nothing.
      if (words.length === 1 && words[0] !== undefined) learn(words[0]);
    }
  }
  const spellings = new Map(
    [...counts].map(([lower, spelled]) => [
      lower,
      [...spelled].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? lower,
    ]),
  );
  return { known, spellings };
}

/** Names known to be single detachments (see detachmentVocabulary). */
export async function knownDetachments(db: Db): Promise<Set<string>> {
  return (await detachmentVocabulary(db)).known;
}

/** Cleans, splits and respells a list's detachments against what the stored lists say. */
function tidy(detachments: string[], vocabulary: DetachmentVocabulary): string[] {
  return splitDetachments(detachments.map(cleanDetachmentName), vocabulary.known).map(
    (name) => vocabulary.spellings.get(name.toLowerCase()) ?? name,
  );
}

/** The parsed columns for a list's text. */
function parsedColumns(text: string | null, vocabulary: DetachmentVocabulary) {
  const parsed = parseArmyList(text);
  return {
    parsedArmy: parsed.army,
    detachments: tidy(parsed.detachments, vocabulary),
    parsedDisposition: parsed.disposition,
    parserVersion: PARSER_VERSION,
  };
}

/**
 * Re-tidies every stored list's detachments (split, spelling) now that more lists are known;
 * runs at startup and on every automatic-fetching pass. Returns how many lists changed.
 */
export async function tidyDetachments(db: Db): Promise<number> {
  const vocabulary = await detachmentVocabulary(db);
  const rows = await db
    .select({ playerId: armyLists.playerId, detachments: armyLists.detachments })
    .from(armyLists)
    .where(sql`cardinality(${armyLists.detachments}) > 0`);
  let changed = 0;
  for (const { playerId, detachments } of rows) {
    const tidied = tidy(detachments, vocabulary);
    if (tidied.join('\u0000') !== detachments.join('\u0000')) {
      await db
        .update(armyLists)
        .set({ detachments: tidied })
        .where(eq(armyLists.playerId, playerId));
      changed += 1;
    }
  }
  return changed;
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
    ...parsedColumns(list.text, await detachmentVocabulary(db)),
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
const EMPTY_VOCABULARY: DetachmentVocabulary = { known: new Set(), spellings: new Map() };

/**
 * Re-reads lists parsed by an older parser (no BCP requests), then tidies every list's
 * detachments against the full set of lists. Returns how many lists were re-read.
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
        .set(parsedColumns(text, EMPTY_VOCABULARY))
        .where(eq(armyLists.playerId, playerId));
    }
    reparsed += batch.length;
    logger.debug({ reparsed }, 'Re-reading stored army lists');
  }

  await tidyDetachments(db);
  return reparsed;
}
