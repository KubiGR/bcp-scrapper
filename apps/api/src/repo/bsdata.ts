import { BCP_FACTIONS, parseBsdataCatalogues, type BsdataStatus } from '@bcp/shared';
import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { BsdataClient } from '../bsdata/client';
import type { Db } from '../db/client';
import { appSettings, bsdataDetachments, bsdataFiles } from '../db/schema';

const CHECKED_AT = 'bsdataCheckedAt';
/** Why the last read of BSData's commit history (for game updates) failed; absent when it worked. */
export const HISTORY_ERROR = 'bsdataHistoryError';
const DAY_MS = 86_400_000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function checkedAt(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, CHECKED_AT));
  return typeof row?.value === 'string' ? row.value : null;
}

/** Last check, faction counts (A→Z) and files whose last read failed. */
export async function bsdataStatus(db: Db): Promise<BsdataStatus> {
  const [at, counts, errors, history] = await Promise.all([
    checkedAt(db),
    db
      .select({ faction: bsdataDetachments.faction, detachments: sql<number>`count(*)::int` })
      .from(bsdataDetachments)
      .groupBy(bsdataDetachments.faction)
      .orderBy(asc(bsdataDetachments.faction)),
    db
      .select({ path: bsdataFiles.path, error: bsdataFiles.error })
      .from(bsdataFiles)
      .where(isNotNull(bsdataFiles.error))
      .orderBy(asc(bsdataFiles.path)),
    db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, HISTORY_ERROR)),
  ]);
  const historyError = history[0]?.value;
  const covered = new Set(counts.map((row) => row.faction));
  return {
    checkedAt: at,
    factions: counts,
    errors: [
      ...errors.flatMap((row) =>
        row.error === null ? [] : [{ path: row.path, error: row.error }],
      ),
      ...(typeof historyError === 'string'
        ? [{ path: 'Commit history', error: historyError }]
        : []),
    ],
    uncovered: BCP_FACTIONS.filter((faction) => !covered.has(faction)),
  };
}

/** True when BSData hasn't been checked in the last 24 hours. */
export async function bsdataDue(db: Db, now: Date): Promise<boolean> {
  const at = await checkedAt(db);
  return at === null || now.getTime() - Date.parse(at) >= DAY_MS;
}

/** Faction → its BSData detachments (A→Z); a faction missing here isn't covered. */
export async function bsdataByFaction(db: Db): Promise<Map<string, string[]>> {
  const rows = await db
    .select()
    .from(bsdataDetachments)
    .orderBy(asc(bsdataDetachments.faction), asc(bsdataDetachments.name));
  const byFaction = new Map<string, string[]>();
  for (const row of rows)
    byFaction.set(row.faction, [...(byFaction.get(row.faction) ?? []), row.name]);
  return byFaction;
}

/**
 * Reads BSData again when any file changed: every file then (catalogues link to each other), one
 * at a time. When all were read, each parsed faction's detachments replace its old ones. While
 * any file fails, or nothing is found, everything stays as it was (the errors are recorded) and
 * the new versions are read again next time.
 */
export async function syncBsdata(db: Db, client: BsdataClient, now: Date): Promise<BsdataStatus> {
  const tree = await client.tree();
  const stored = new Map(
    (await db.select().from(bsdataFiles)).map((row) => [row.path, row.sha] as const),
  );
  const changedPaths = new Set(
    tree.files.filter((file) => stored.get(file.path) !== file.sha).map((file) => file.path),
  );
  if (changedPaths.size > 0) {
    const bodies: unknown[] = [];
    const failed = new Map<string, string>();
    for (const file of tree.files) {
      try {
        bodies.push(await client.file(tree.commit, file.path));
      } catch (error) {
        failed.set(file.path, messageOf(error));
      }
    }
    const parse = parseBsdataCatalogues(bodies);
    const found = [...parse.factions.values()].some((names) => names.length > 0);
    const hadData = (await db.$count(bsdataDetachments)) > 0;
    // Factions read across files (shared libraries): a missing file could leave them half read.
    const taken = found && failed.size === 0;
    await db.transaction(async (tx) => {
      if (taken) {
        for (const [faction, names] of parse.factions) {
          if (names.length === 0) continue;
          await tx.delete(bsdataDetachments).where(eq(bsdataDetachments.faction, faction));
          await tx.insert(bsdataDetachments).values(names.map((name) => ({ faction, name })));
        }
      }
      for (const file of tree.files) {
        const error =
          failed.get(file.path) ??
          (!found && hadData && changedPaths.has(file.path) ? 'no detachments found' : null);
        // A version not taken in stays unread, so it's read again next time.
        const sha = taken ? file.sha : (stored.get(file.path) ?? '');
        await tx
          .insert(bsdataFiles)
          .values({ path: file.path, sha, checkedAt: now, error })
          .onConflictDoUpdate({ target: bsdataFiles.path, set: { sha, checkedAt: now, error } });
      }
    });
  }
  await db
    .insert(appSettings)
    .values({ key: CHECKED_AT, value: now.toISOString() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: now.toISOString(), updatedAt: now },
    });
  return bsdataStatus(db);
}
