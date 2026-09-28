import {
  ALLEGIANCE_NAMES,
  cleanDetachmentName,
  looksForeign,
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
 * The player's army as the rest of the app counts it: BCP's faction, or the army read from the
 * list when BCP only names an allegiance ("Forces of the Hive Mind"); null when neither says.
 */
const armyOf = sql<string | null>`case
  when ${players.faction} is null or lower(${players.faction}) in (${sql.join(
    ALLEGIANCE_NAMES.map((name) => sql`${name}`),
    sql`, `,
  )})
  then ${armyLists.parsedArmy}
  else ${players.faction}
end`;

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

  const targets = new Map<string, { name: string; factions: Set<string> }>();
  for (const row of bcpRows) {
    const name = cleanDetachmentName(row.name);
    const target = targets.get(name.toLowerCase()) ?? { name, factions: new Set<string>() };
    if (row.faction !== null) target.factions.add(row.faction);
    targets.set(name.toLowerCase(), target);
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
