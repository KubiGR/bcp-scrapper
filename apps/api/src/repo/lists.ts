import {
  parseArmyList,
  PARSER_VERSION,
  canonicalDetachment,
  cleanDetachmentName,
  DETACHMENT_TRANSLATIONS,
  detachmentParts,
  looksForeign,
  countedFaction,
  splitDetachments,
  type ArmyList,
  type PlayerList,
} from '@bcp/shared';
import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Fetched } from '../bcp/source';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import { armyLists, detachmentLinks, players, teams } from '../db/schema';

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

/** The detachment the player picked on BCP (always English), from a stored list's raw data. */
const RawBcpDetachment = z.object({
  warhammer: z.object({ detachment: z.string().min(1) }).nullish(),
});
export function bcpDetachmentOf(raw: unknown): string | null {
  const parsed = RawBcpDetachment.safeParse(raw);
  const name = parsed.success ? parsed.data.warhammer?.detachment : undefined;
  return name === undefined ? null : cleanDetachmentName(name);
}

/** Every stored list's text and BCP detachment. */
function sourceRows(db: Db) {
  return db
    .select({
      playerId: armyLists.playerId,
      text: armyLists.text,
      detachments: armyLists.detachments,
      bcp: sql<string | null>`${armyLists.raw} -> 'warhammer' ->> 'detachment'`,
    })
    .from(armyLists);
}

/** A translation is learned from this many agreeing lists, and at least this share of them. */
const LEARN_MIN_LISTS = 2;
const LEARN_MIN_SHARE = 0.8;

/** What the stored lists say about detachment names. */
interface DetachmentVocabulary {
  /** Names known to be single detachments: taken alone, named in a comma list, or BCP's names. */
  known: Set<string>;
  /** Lower-case name → its most common spelling. */
  spellings: Map<string, string>;
  /** Lower-case name as written in a list → the English name, learned from BCP. */
  translations: Map<string, string>;
  /** Lower-case name → what an admin linked it to (null: its own detachment); wins over all. */
  links: Map<string, string | null>;
}

/**
 * Translations learned from BCP's detachment field that no hand link overrides, as lists spell
 * them: shown in Settings so a wrong one can be undone.
 */
export async function learnedTranslations(db: Db): Promise<{ name: string; target: string }[]> {
  const vocabulary = await detachmentVocabulary(db);
  return [...vocabulary.translations]
    .filter(([key]) => !vocabulary.links.has(key))
    .map(([key, target]) => ({ name: vocabulary.spellings.get(key) ?? key, target }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Learns detachment names from every stored list. A line without "and"-type joiners is one name;
 * a comma list names its detachments; BCP's own detachment field is always a name (in English).
 * A list naming one detachment that isn't one of BCP's names, while BCP says another, teaches a
 * translation once enough lists agree.
 */
async function detachmentVocabulary(db: Db): Promise<DetachmentVocabulary> {
  // From what each list says (its text, re-read), never from earlier tidied results.
  const rows = (await sourceRows(db)).map(({ text, bcp }) => ({
    detachments: parseArmyList(text).detachments,
    bcp,
  }));
  const known = new Set<string>();
  const counts = new Map<string, Map<string, number>>();
  const learn = (name: string) => {
    known.add(name);
    const spelled = counts.get(name.toLowerCase()) ?? new Map<string, number>();
    spelled.set(name, (spelled.get(name) ?? 0) + 1);
    counts.set(name.toLowerCase(), spelled);
  };
  const bcpNames = new Set<string>();
  for (const { bcp } of rows) {
    if (bcp !== null && bcp.trim() !== '') {
      const name = cleanDetachmentName(bcp);
      learn(name);
      bcpNames.add(name.toLowerCase());
    }
  }
  const pairs = new Map<string, Map<string, number>>();
  for (const { detachments, bcp } of rows) {
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
    const [only] = names;
    if (
      names.length === 1 &&
      only !== undefined &&
      bcp !== null &&
      detachmentParts(only).length === 1 &&
      !bcpNames.has(only.toLowerCase()) &&
      // Only names in another language: an English-looking unknown name is most likely a
      // detachment BCP doesn't list yet, whose players picked the nearest one on BCP.
      looksForeign(only)
    ) {
      const english = cleanDetachmentName(bcp);
      const seen = pairs.get(only.toLowerCase()) ?? new Map<string, number>();
      seen.set(english, (seen.get(english) ?? 0) + 1);
      pairs.set(only.toLowerCase(), seen);
    }
  }
  const translations = new Map<string, string>();
  for (const [name, seen] of pairs) {
    const total = [...seen.values()].reduce((sum, n) => sum + n, 0);
    const [best] = [...seen].sort((x, y) => y[1] - x[1]);
    if (best !== undefined && best[1] >= LEARN_MIN_LISTS && best[1] >= total * LEARN_MIN_SHARE) {
      translations.set(name, best[0]);
    }
  }
  const links = new Map(
    (await db.select().from(detachmentLinks)).map((link) => [link.nameKey, link.target]),
  );
  for (const [name, target] of links) {
    known.add(name);
    if (target !== null) known.add(target);
  }
  // Translated names are detachments too, so "Die Macht der Moritoi und Shield Host" splits.
  for (const [name, english] of Object.entries(DETACHMENT_TRANSLATIONS)) {
    known.add(name);
    known.add(english);
  }
  const spellings = new Map(
    [...counts].map(([lower, spelled]) => [
      lower,
      [...spelled].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? lower,
    ]),
  );
  return { known, spellings, translations, links };
}

/** Names known to be single detachments (see detachmentVocabulary). */
export async function knownDetachments(db: Db): Promise<Set<string>> {
  return (await detachmentVocabulary(db)).known;
}

/**
 * Cleans, splits, translates and respells a list's detachments against what the stored lists
 * say; a list without readable detachments takes the one the player picked on BCP.
 */
function tidy(
  detachments: string[],
  vocabulary: DetachmentVocabulary,
  bcpDetachment: string | null,
): string[] {
  if (detachments.length === 0) return bcpDetachment === null ? [] : [bcpDetachment];
  const known = new Set([...vocabulary.known, ...vocabulary.translations.keys()]);
  return splitDetachments(detachments.map(cleanDetachmentName), known)
    .map((name) => {
      const key = name.toLowerCase();
      if (vocabulary.links.has(key)) return vocabulary.links.get(key) ?? name;
      return vocabulary.translations.get(key) ?? canonicalDetachment(name);
    })
    .map((name) => vocabulary.spellings.get(name.toLowerCase()) ?? name);
}

/** The parsed columns for a list's text. */
function parsedColumns(
  text: string | null,
  vocabulary: DetachmentVocabulary,
  bcpDetachment: string | null,
) {
  const parsed = parseArmyList(text);
  return {
    parsedArmy: parsed.army,
    detachments: tidy(parsed.detachments, vocabulary, bcpDetachment),
    parsedDisposition: parsed.disposition,
    parserVersion: PARSER_VERSION,
  };
}

/**
 * Re-tidies every stored list's detachments from its text (split, translation, spelling) now that
 * more lists are known;
 * runs at startup and on every automatic-fetching pass. Returns how many lists changed.
 */
export async function tidyDetachments(db: Db): Promise<number> {
  const vocabulary = await detachmentVocabulary(db);
  let changed = 0;
  for (const { playerId, text, detachments, bcp } of await sourceRows(db)) {
    const tidied = tidy(
      parseArmyList(text).detachments,
      vocabulary,
      bcp === null ? null : cleanDetachmentName(bcp),
    );
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

/**
 * Stores a player's list. `listId`: the id it was asked for (the player's), which is what marks
 * it as their current list; BCP could answer under another.
 */
export async function saveArmyList(
  db: Db,
  playerId: string,
  list: Fetched<ArmyList>,
  listId: string = list.bcpId,
): Promise<void> {
  const values = {
    listId,
    text: list.text,
    raw: list.raw,
    fetchedAt: new Date(),
    ...parsedColumns(list.text, await detachmentVocabulary(db), bcpDetachmentOf(list.raw)),
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

/**
 * Every stored list of an event, best placing first (unplaced players last, by name). The faction
 * is the one the player table shows: the army read from the list when BCP only names an
 * allegiance.
 */
export async function listEventArmyLists(db: Db, eventId: string): Promise<ExportedList[]> {
  const rows = await db
    .select({
      placing: players.placing,
      player: players.name,
      team: teams.name,
      bcpFaction: players.faction,
      parsedArmy: armyLists.parsedArmy,
      listId: armyLists.listId,
      text: armyLists.text,
    })
    .from(armyLists)
    .innerJoin(players, eq(players.id, armyLists.playerId))
    .leftJoin(teams, eq(teams.id, players.teamId))
    .where(eq(players.eventId, eventId))
    .orderBy(sql`${players.placing} asc nulls last`, players.name);
  return rows.map(({ bcpFaction, parsedArmy, ...row }) => ({
    ...row,
    faction: countedFaction(bcpFaction, parsedArmy).faction,
  }));
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
const EMPTY_VOCABULARY: DetachmentVocabulary = {
  known: new Set(),
  spellings: new Map(),
  translations: new Map(),
  links: new Map(),
};

/**
 * Re-reads lists parsed by an older parser (no BCP requests), then tidies every list's
 * detachments against the full set of lists. Returns how many lists were re-read.
 */
export async function reparseLists(db: Db, logger: Logger): Promise<number> {
  let reparsed = 0;
  for (;;) {
    const batch = await db
      .select({ playerId: armyLists.playerId, text: armyLists.text, raw: armyLists.raw })
      .from(armyLists)
      .where(lt(armyLists.parserVersion, PARSER_VERSION))
      .limit(REPARSE_BATCH);
    if (batch.length === 0) break;
    for (const { playerId, text, raw } of batch) {
      await db
        .update(armyLists)
        .set(parsedColumns(text, EMPTY_VOCABULARY, bcpDetachmentOf(raw)))
        .where(eq(armyLists.playerId, playerId));
    }
    reparsed += batch.length;
    logger.debug({ reparsed }, 'Re-reading stored army lists');
  }

  await tidyDetachments(db);
  return reparsed;
}
