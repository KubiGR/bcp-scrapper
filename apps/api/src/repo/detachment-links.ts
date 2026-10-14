import {
  ALLEGIANCE_NAMES,
  cleanDetachmentName,
  countedFaction,
  looksForeign,
  looseDetachmentKey,
  matchDetachment,
  SPACE_MARINES,
  type DetachmentNamesResponse,
} from '@bcp/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, detachmentKeeps, detachmentLinks, players } from '../db/schema';
import { bsdataByFaction } from './bsdata';
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
  // Ignored names count as unknown in Meta, like names that aren't English.
  const linked = new Map(links.map((link) => [link.nameKey, link.foreign || link.ignored]));
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

/** Lower-case BSData detachments per faction, and the kept (faction, lower-case name) pairs. */
async function bsdataRules(db: Db) {
  const [bsdata, keeps, ownLinks] = await Promise.all([
    bsdataByFaction(db),
    db.select().from(detachmentKeeps).orderBy(detachmentKeeps.faction, detachmentKeeps.name),
    db
      .select({ nameKey: detachmentLinks.nameKey })
      .from(detachmentLinks)
      .where(and(isNull(detachmentLinks.target), eq(detachmentLinks.foreign, false))),
  ]);
  // A name marked as its own detachment is one BSData doesn't have (yet): never flagged.
  const own = new Set(ownLinks.map((link) => link.nameKey));
  // Compared loosely: a spelling that differs only in case, accents or punctuation is the same.
  const names = new Map(
    [...bsdata].map(([faction, list]) => [faction, new Set(list.map(looseDetachmentKey))]),
  );
  // Ignored pairs are only off the to-do list: still outside the army.
  const kept = new Set(
    keeps.filter((keep) => !keep.ignored).map((keep) => `${keep.faction}\u0000${keep.nameKey}`),
  );
  /**
   * Whether a list's detachment is outside its army's BSData list (and not kept anyway). A small
   * misspelling of one of the army's detachments ("Berserker" for "Berzerker") is that one.
   */
  const wrong = (army: string | null, name: string) => {
    if (army === null) return false;
    const known = names.get(army);
    if (known === undefined) return false;
    const key = keyOf(name);
    if (known.has(looseDetachmentKey(name)) || own.has(key) || kept.has(`${army}\u0000${key}`)) {
      return false;
    }
    return matchDetachment(name, bsdata.get(army) ?? []) === null;
  };
  return { bsdata, keeps, wrong };
}

/** (army, detachment) → whether it's a wrong pair: army covered by BSData, name not in it, not kept. */
export async function wrongPairCheck(
  db: Db,
): Promise<(army: string | null, name: string) => boolean> {
  return (await bsdataRules(db)).wrong;
}

/** How every page decides a player's army and which of their detachments count. */
export interface ArmyRules {
  /** The army a player counts as (see `resolveFaction`), BSData settling a list naming none. */
  army: (
    bcpFaction: string | null,
    parsedArmy: string | null,
    detachments: string[],
  ) => { faction: string | null; factionGuessed: boolean };
  /** The detachments that count: none (detachment unknown) when any isn't English or is outside
   * the army's BSData list (and wasn't kept). */
  detachments: (army: string | null, names: string[]) => string[];
  /**
   * Whether a filter offers the name: only BSData's detachments, the army's (any army's, when the
   * army isn't known). Linked names are already stored as BSData's.
   */
  offered: (army: string | null, name: string) => boolean;
}

export async function armyRules(db: Db): Promise<ArmyRules> {
  const [{ bsdata, wrong }, foreign] = await Promise.all([
    bsdataRules(db),
    foreignDetachmentCheck(db),
  ]);
  const owners = new Map<string, Set<string>>();
  for (const [faction, names] of bsdata) {
    for (const name of names) {
      const key = looseDetachmentKey(name);
      owners.set(key, (owners.get(key) ?? new Set()).add(faction));
    }
  }
  /** The one army all the detachments belong to in BSData, when BCP's army lacks them. */
  const soleOwner = (bcpFaction: string | null, names: string[]) => {
    if (names.length === 0) return null;
    const base = countedFaction(bcpFaction, null).faction;
    if (base !== null && names.every((name) => !wrong(base, name))) return null;
    const shared = names
      .map((name) => owners.get(looseDetachmentKey(name)) ?? new Set<string>())
      .reduce((all, next) => new Set([...all].filter((army) => next.has(army))));
    return shared.size === 1 ? ([...shared][0] ?? null) : null;
  };
  return {
    army: (bcpFaction, parsedArmy, names) =>
      countedFaction(bcpFaction, parsedArmy, soleOwner(bcpFaction, names)),
    detachments: (army, names) =>
      names.some((name) => foreign(name) || wrong(army, name)) ? [] : names,
    offered: (army, name) => {
      const factions = owners.get(looseDetachmentKey(name));
      if (factions === undefined) return false;
      return army === null || !bsdata.has(army) || factions.has(army);
    },
  };
}

/**
 * Keeps a detachment for a faction although BSData doesn't list it there; `ignored`: only sets
 * the pair aside (off the to-do list), still counted as detachment unknown.
 */
export async function keepDetachment(
  db: Db,
  faction: string,
  name: string,
  ignored = false,
): Promise<void> {
  const clean = cleanDetachmentName(name);
  await db
    .insert(detachmentKeeps)
    .values({ faction, nameKey: clean.toLowerCase(), name: clean, ignored })
    .onConflictDoUpdate({
      target: [detachmentKeeps.faction, detachmentKeeps.nameKey],
      set: { ignored },
    });
}

export async function unkeepDetachment(db: Db, faction: string, name: string): Promise<void> {
  await db
    .delete(detachmentKeeps)
    .where(and(eq(detachmentKeeps.faction, faction), eq(detachmentKeeps.nameKey, keyOf(name))));
}

export async function detachmentNames(db: Db): Promise<DetachmentNamesResponse> {
  const [bcpRows, storedRows, links, learned, rules] = await Promise.all([
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
    bsdataRules(db),
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
  const targets = new Map<string, { name: string; factions: Set<string>; bsdata: boolean }>();
  // BSData's detachments first: their spelling and factions win.
  for (const [faction, names] of rules.bsdata) {
    for (const name of names) {
      const target = targets.get(name.toLowerCase()) ?? {
        name,
        factions: new Set<string>(),
        bsdata: true,
      };
      target.factions.add(faction);
      targets.set(name.toLowerCase(), target);
    }
  }
  for (const [key, { name, factions }] of bcpNames) {
    if (!targets.has(key)) {
      targets.set(key, { name, factions: new Set(ownFactions(factions)), bsdata: false });
    }
  }
  // Linked names are settled; those marked as not English stay listed, apart.
  const settled = new Set(
    links.filter((link) => !link.foreign && !link.ignored).map((link) => link.nameKey),
  );
  const marked = new Set(links.filter((link) => link.foreign).map((link) => link.nameKey));
  // Ignored as junk: listed apart, never among the names to sort.
  const ignoredKeys = new Set(links.filter((link) => link.ignored).map((link) => link.nameKey));
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
    if (link.foreign || link.ignored || link.target !== null || targets.has(link.nameKey)) continue;
    targets.set(link.nameKey, {
      name: link.name,
      factions: storedFactions.get(link.nameKey) ?? new Set<string>(),
      bsdata: false,
    });
  }

  const all = [...unsure.values()].map((entry) => ({
    name: entry.name,
    lists: entry.players.size,
    factions: sorted(entry.factions),
  }));
  const ignored = all
    .filter((entry) => ignoredKeys.has(entry.name.toLowerCase()))
    .sort((a, b) => b.lists - a.lists || a.name.localeCompare(b.name));
  const names = [...unsure.values()]
    .filter((entry) => !ignoredKeys.has(entry.name.toLowerCase()))
    .map((entry) => ({
      name: entry.name,
      lists: entry.players.size,
      factions: sorted(entry.factions),
      marked: marked.has(entry.name.toLowerCase()),
    }))
    .sort((a, b) => b.lists - a.lists || a.name.localeCompare(b.name));
  const isForeign = (entry: { name: string; marked: boolean }) =>
    entry.marked || looksForeign(entry.name);

  const setAside = new Set(
    rules.keeps
      .filter((keep) => keep.ignored)
      .map((keep) => `${keep.faction}\u0000${keep.nameKey}`),
  );
  // Detachments outside their army's BSData list (names that aren't English are listed apart).
  const wrongLists = new Map<string, { faction: string; name: string; players: Set<string> }>();
  for (const row of storedRows) {
    if (row.faction === null || !rules.wrong(row.faction, row.name)) continue;
    // Names nobody knows need linking first ("Not linked yet" / "Not in English").
    if (unsure.has(row.name.toLowerCase())) continue;
    if (isForeign({ name: row.name, marked: marked.has(row.name.toLowerCase()) })) continue;
    if (ignoredKeys.has(row.name.toLowerCase())) continue;
    const key = `${row.faction}\u0000${row.name.toLowerCase()}`;
    // A pair set aside (ignored) is off this list, though still not counted.
    if (setAside.has(key)) continue;
    const entry = wrongLists.get(key) ?? {
      faction: row.faction,
      name: row.name,
      players: new Set<string>(),
    };
    entry.players.add(row.playerId);
    wrongLists.set(key, entry);
  }
  const bsdataFactionsOf = (name: string) =>
    sorted(
      [...rules.bsdata]
        .filter(([, names]) => names.some((n) => n.toLowerCase() === name.toLowerCase()))
        .map(([faction]) => faction),
    );

  return {
    unsure: names
      .filter((entry) => !isForeign(entry))
      .map(({ name, lists, factions }) => ({ name, lists, factions })),
    foreign: names.filter(isForeign),
    ignored,
    learned: learned.map((translation) => ({
      ...translation,
      factions: sorted(targets.get(translation.target.toLowerCase())?.factions ?? []),
    })),
    targets: [...targets.values()]
      .map((target) => ({
        name: target.name,
        factions: sorted(target.factions),
        bsdata: target.bsdata,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    bsdataFactions: sorted(rules.bsdata.keys()),
    wrong: [...wrongLists.values()]
      .map((entry) => ({
        faction: entry.faction,
        name: entry.name,
        lists: entry.players.size,
        bsdataFactions: bsdataFactionsOf(entry.name),
      }))
      // The most used first: they matter most to Meta.
      .sort(
        (a, b) =>
          b.lists - a.lists || a.faction.localeCompare(b.faction) || a.name.localeCompare(b.name),
      ),
    kept: rules.keeps.map((keep) => ({
      faction: keep.faction,
      name: keep.name,
      ignored: keep.ignored,
    })),
    // A linked name no longer appears in stored lists: it belongs to its target's factions.
    links: links
      .filter((link) => !link.foreign && !link.ignored)
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
 * Links `name` to `target` (null: its own detachment; with `foreign`, a name that isn't English;
 * with `ignored`, junk to leave alone) and re-tidies every stored list.
 */
export async function linkDetachment(
  db: Db,
  name: string,
  target: string | null,
  foreign = false,
  ignored = false,
): Promise<void> {
  const clean = cleanDetachmentName(name);
  const value = {
    nameKey: keyOf(clean),
    name: clean,
    target: target === null || foreign || ignored ? null : cleanDetachmentName(target),
    foreign: foreign && !ignored,
    ignored,
  };
  await db
    .insert(detachmentLinks)
    .values(value)
    .onConflictDoUpdate({
      target: detachmentLinks.nameKey,
      set: {
        name: value.name,
        target: value.target,
        foreign: value.foreign,
        ignored: value.ignored,
      },
    });
  await tidyDetachments(db);
}

/** Removes a link and re-tidies every stored list. */
export async function unlinkDetachment(db: Db, name: string): Promise<void> {
  await db.delete(detachmentLinks).where(eq(detachmentLinks.nameKey, keyOf(name)));
  await tidyDetachments(db);
}
