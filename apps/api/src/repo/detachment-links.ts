import { cleanDetachmentName, type DetachmentNamesResponse } from '@bcp/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, detachmentLinks, players } from '../db/schema';
import { tidyDetachments } from './lists';

const keyOf = (name: string) => cleanDetachmentName(name).toLowerCase();
const sorted = (values: Iterable<string>) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

/**
 * Detachment names stored lists use that BCP never uses (so they may be translations or
 * misspellings), most used first; BCP's names with their factions to link them to; and the links
 * made so far.
 */
export async function detachmentNames(db: Db): Promise<DetachmentNamesResponse> {
  const [bcpRows, storedRows, links] = await Promise.all([
    db
      .select({
        name: sql<string>`${armyLists.raw} -> 'warhammer' ->> 'detachment'`,
        faction: players.faction,
      })
      .from(armyLists)
      .innerJoin(players, eq(players.id, armyLists.playerId))
      .where(sql`${armyLists.raw} -> 'warhammer' ->> 'detachment' is not null`),
    db
      .select({
        name: sql<string>`unnest(${armyLists.detachments})`,
        playerId: armyLists.playerId,
        faction: players.faction,
      })
      .from(armyLists)
      .innerJoin(players, eq(players.id, armyLists.playerId)),
    db.select().from(detachmentLinks).orderBy(detachmentLinks.name),
  ]);

  const targets = new Map<string, { name: string; factions: Set<string> }>();
  for (const row of bcpRows) {
    const name = cleanDetachmentName(row.name);
    const target = targets.get(name.toLowerCase()) ?? { name, factions: new Set<string>() };
    if (row.faction !== null) target.factions.add(row.faction);
    targets.set(name.toLowerCase(), target);
  }
  const linked = new Set(links.map((link) => link.nameKey));
  const unsure = new Map<string, { name: string; players: Set<string>; factions: Set<string> }>();
  const storedFactions = new Map<string, Set<string>>();
  for (const row of storedRows) {
    const key = row.name.toLowerCase();
    if (row.faction !== null) {
      storedFactions.set(key, (storedFactions.get(key) ?? new Set()).add(row.faction));
    }
    if (targets.has(key) || linked.has(key)) continue;
    const entry = unsure.get(key) ?? { name: row.name, players: new Set(), factions: new Set() };
    entry.players.add(row.playerId);
    if (row.faction !== null) entry.factions.add(row.faction);
    unsure.set(key, entry);
  }

  return {
    unsure: [...unsure.values()]
      .map((entry) => ({
        name: entry.name,
        lists: entry.players.size,
        factions: sorted(entry.factions),
      }))
      .sort((a, b) => b.lists - a.lists || a.name.localeCompare(b.name)),
    targets: [...targets.values()]
      .map((target) => ({ name: target.name, factions: sorted(target.factions) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    // A linked name no longer appears in stored lists: it belongs to its target's factions.
    links: links.map((link) => ({
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

/** Links `name` to `target` (null: its own detachment) and re-tidies every stored list. */
export async function linkDetachment(db: Db, name: string, target: string | null): Promise<void> {
  const clean = cleanDetachmentName(name);
  const value = {
    nameKey: keyOf(clean),
    name: clean,
    target: target === null ? null : cleanDetachmentName(target),
  };
  await db
    .insert(detachmentLinks)
    .values(value)
    .onConflictDoUpdate({
      target: detachmentLinks.nameKey,
      set: { name: value.name, target: value.target },
    });
  await tidyDetachments(db);
}

/** Removes a link and re-tidies every stored list. */
export async function unlinkDetachment(db: Db, name: string): Promise<void> {
  await db.delete(detachmentLinks).where(eq(detachmentLinks.nameKey, keyOf(name)));
  await tidyDetachments(db);
}
