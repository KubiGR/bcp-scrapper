import { BCP_FACTIONS, type DetachmentsStatus } from '@bcp/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { factionDetachments } from '../db/schema';

/** Faction → its known detachments (A→Z); a faction missing here isn't covered. */
export async function detachmentsByFaction(db: Db): Promise<Map<string, string[]>> {
  const rows = await db
    .select()
    .from(factionDetachments)
    .orderBy(asc(factionDetachments.faction), asc(factionDetachments.name));
  const byFaction = new Map<string, string[]>();
  for (const row of rows)
    byFaction.set(row.faction, [...(byFaction.get(row.faction) ?? []), row.name]);
  return byFaction;
}

/**
 * Each read faction's detachments replace its old ones; a faction read with none, or not read,
 * keeps what it had (a faction never drops out because one read missed it).
 */
export async function replaceFactionDetachments(
  db: Pick<Db, 'delete' | 'insert'>,
  byFaction: Map<string, string[]>,
): Promise<void> {
  for (const [faction, names] of byFaction) {
    if (names.length === 0) continue;
    await db.delete(factionDetachments).where(eq(factionDetachments.faction, faction));
    await db.insert(factionDetachments).values(names.map((name) => ({ faction, name })));
  }
}

/** Each covered faction's detachment count (A→Z), and BCP's factions with none known. */
export async function detachmentsStatus(db: Db): Promise<DetachmentsStatus> {
  const counts = await db
    .select({ faction: factionDetachments.faction, detachments: sql<number>`count(*)::int` })
    .from(factionDetachments)
    .groupBy(factionDetachments.faction)
    .orderBy(asc(factionDetachments.faction));
  const covered = new Set(counts.map((row) => row.faction));
  return {
    factions: counts,
    uncovered: BCP_FACTIONS.filter((faction) => !covered.has(faction)),
  };
}
