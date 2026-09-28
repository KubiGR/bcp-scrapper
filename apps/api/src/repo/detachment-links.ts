import {
  ALLEGIANCE_NAMES,
  cleanDetachmentName,
  looksForeign,
  SPACE_MARINES,
  type DetachmentNamesResponse,
} from '@bcp/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, detachmentLinks, players } from '../db/schema';
import { learnedTranslations, tidyDetachments } from './lists';

const keyOf = (name: string) => cleanDetachmentName(name).toLowerCase();
const sorted = (values: Iterable<string>) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

const bcpName = sql<string>`${armyLists.raw} -> 'warhammer' ->> 'detachment'`;

/**
 * Whether a detachment name isn't English, for Meta: marked so by hand, or looking foreign —
 * unless BCP uses the name or it's linked (a name marked as its own detachment is English).
 */
export async function foreignDetachmentCheck(db: Db): Promise<(name: string) => boolean> {
  const [bcpRows, links] = await Promise.all([
    db
      .selectDistinct({ name: bcpName })
      .from(armyLists)
      .where(sql`${bcpName} is not null`),
    db.select().from(detachmentLinks),
  ]);
  const bcp = new Set(bcpRows.map((row) => keyOf(row.name)));
  const linked = new Map(links.map((link) => [link.nameKey, link.foreign]));
  return (name) => {
    const key = keyOf(name);
    if (bcp.has(key)) return false;
    return linked.get(key) ?? looksForeign(name);
  };
}

/**
 * Detachment names stored lists use that BCP never uses (so they may be translations or
 * misspellings), most used first; BCP's names with their factions to link them to; and the links
 * made so far.
 */
/**
 * The army a list's detachments belong to: the list's own army, since BCP's faction can be wrong
 * (a Space Wolves list registered as Necrons); BCP's when the list names none, or only Space
 * Marines while BCP names the chapter; never an allegiance like "Forces of the Hive Mind".
 */
const armyOf = sql<string | null>`case
  when ${armyLists.parsedArmy} is not null and ${armyLists.parsedArmy} <> ${SPACE_MARINES}
  then ${armyLists.parsedArmy}
  when ${players.faction} is null or lower(${players.faction}) in (${sql.join(
    ALLEGIANCE_NAMES.map((name) => sql`${name}`),
    sql`, `,
  )})
  then ${armyLists.parsedArmy}
  else ${players.faction}
end`;

/** Lists of a detachment's clear owner before another faction's single list stops counting. */
const OWNER_LISTS = 3;

/**
 * The factions a detachment belongs to, from how many lists of each use it: a faction with a
 * single list is left out when another has OWNER_LISTS or more (most likely a slip on BCP, like a
 * Genestealer Cult player shown with Khorne Daemonkin).
 */
function ownFactions(counts: Map<string, number>): string[] {
  const clearOwner = [...counts.values()].some((lists) => lists >= OWNER_LISTS);
  return [...counts].filter(([, lists]) => lists > 1 || !clearOwner).map(([faction]) => faction);
}

export async function detachmentNames(db: Db): Promise<DetachmentNamesResponse> {
  const [bcpRows, storedRows, links, learned] = await Promise.all([
    db
      .select({ name: bcpName, faction: armyOf })
      .from(armyLists)
      .innerJoin(players, eq(players.id, armyLists.playerId))
      .where(sql`${bcpName} is not null`),
    db
      .select({
        name: sql<string>`unnest(${armyLists.detachments})`,
        playerId: armyLists.playerId,
        faction: armyOf,
      })
      .from(armyLists)
      .innerJoin(players, eq(players.id, armyLists.playerId)),
    db.select().from(detachmentLinks).orderBy(detachmentLinks.name),
    learnedTranslations(db),
  ]);

  // BCP's names, with how many lists of each faction use them.
  const bcpNames = new Map<string, { name: string; factions: Map<string, number> }>();
  for (const row of bcpRows) {
    const name = cleanDetachmentName(row.name);
    const entry = bcpNames.get(name.toLowerCase()) ?? { name, factions: new Map<string, number>() };
    if (row.faction !== null) {
      entry.factions.set(row.faction, (entry.factions.get(row.faction) ?? 0) + 1);
    }
    bcpNames.set(name.toLowerCase(), entry);
  }
  const targets = new Map<string, { name: string; factions: Set<string> }>();
  for (const [key, { name, factions }] of bcpNames) {
    targets.set(key, { name, factions: new Set(ownFactions(factions)) });
  }
  // Linked names are settled; those marked as not English stay listed, apart.
  const settled = new Set(links.filter((link) => !link.foreign).map((link) => link.nameKey));
  const marked = new Set(links.filter((link) => link.foreign).map((link) => link.nameKey));
  const unsure = new Map<string, { name: string; players: Set<string>; factions: Set<string> }>();
  const storedFactions = new Map<string, Set<string>>();
  for (const row of storedRows) {
    const key = row.name.toLowerCase();
    if (row.faction !== null) {
      storedFactions.set(key, (storedFactions.get(key) ?? new Set()).add(row.faction));
    }
    if (targets.has(key) || settled.has(key)) continue;
    const entry = unsure.get(key) ?? { name: row.name, players: new Set(), factions: new Set() };
    entry.players.add(row.playerId);
    if (row.faction !== null) entry.factions.add(row.faction);
    unsure.set(key, entry);
  }

  // A name marked as its own detachment is a known one of its factions, and one to link others to.
  for (const link of links) {
    if (link.foreign || link.target !== null || targets.has(link.nameKey)) continue;
    targets.set(link.nameKey, {
      name: link.name,
      factions: storedFactions.get(link.nameKey) ?? new Set<string>(),
    });
  }

  const names = [...unsure.values()]
    .map((entry) => ({
      name: entry.name,
      lists: entry.players.size,
      factions: sorted(entry.factions),
      marked: marked.has(entry.name.toLowerCase()),
    }))
    .sort((a, b) => b.lists - a.lists || a.name.localeCompare(b.name));
  const isForeign = (entry: { name: string; marked: boolean }) =>
    entry.marked || looksForeign(entry.name);

  return {
    unsure: names
      .filter((entry) => !isForeign(entry))
      .map(({ name, lists, factions }) => ({ name, lists, factions })),
    foreign: names.filter(isForeign),
    learned: learned.map((translation) => ({
      ...translation,
      factions: sorted(targets.get(translation.target.toLowerCase())?.factions ?? []),
    })),
    targets: [...targets.values()]
      .map((target) => ({ name: target.name, factions: sorted(target.factions) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // A linked name no longer appears in stored lists: it belongs to its target's factions.
    links: links
      .filter((link) => !link.foreign)
      .map((link) => ({
        name: link.name,
        target: link.target,
        factions: sorted(
          (link.target === null
            ? storedFactions.get(link.nameKey)
            : targets.get(link.target.toLowerCase())?.factions) ?? [],
        ),
      })),
  };
}

/**
 * Links `name` to `target` (null: its own detachment; with `foreign`, a name that isn't English)
 * and re-tidies every stored list.
 */
export async function linkDetachment(
  db: Db,
  name: string,
  target: string | null,
  foreign = false,
): Promise<void> {
  const clean = cleanDetachmentName(name);
  const value = {
    nameKey: keyOf(clean),
    name: clean,
    target: target === null || foreign ? null : cleanDetachmentName(target),
    foreign,
  };
  await db
    .insert(detachmentLinks)
    .values(value)
    .onConflictDoUpdate({
      target: detachmentLinks.nameKey,
      set: { name: value.name, target: value.target, foreign: value.foreign },
    });
  await tidyDetachments(db);
}

/** Removes a link and re-tidies every stored list. */
export async function unlinkDetachment(db: Db, name: string): Promise<void> {
  await db.delete(detachmentLinks).where(eq(detachmentLinks.nameKey, keyOf(name)));
  await tidyDetachments(db);
}
