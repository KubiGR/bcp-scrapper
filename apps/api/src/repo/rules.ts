import { UnitDataSchema, type RulesStatus, type UnitData } from '@bcp/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { appSettings, rulesSnapshot } from '../db/schema';
import { replaceFactionDetachments } from './faction-detachments';
import { tidyDetachments } from './lists';
import { bundleUrlOf, type RulesClient } from '../rules/client';
import { readRulesBundle, RULES_FORMAT } from '../rules/extract';

const CHECKED_AT = 'rulesCheckedAt';
/** Why the last check failed; absent when it worked. */
const ERROR = 'rulesError';
/** The RULES_FORMAT the stored rules were read with, as `v2` (a bare "2" reads back as a number). */
const FORMAT = 'rulesFormat';
const DAY_MS = 86_400_000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function setting(db: Db, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return typeof row?.value === 'string' ? row.value : null;
}

async function putSetting(db: Db, key: string, value: string | null, now: Date): Promise<void> {
  if (value === null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}

const count = (name: string) =>
  sql<number>`jsonb_array_length(${rulesSnapshot.data} -> ${sql.raw(`'${name}'`)})::int`;

/** What rules data is stored, when it was read and checked, and the last check's error. */
export async function rulesStatus(db: Db): Promise<RulesStatus> {
  const [checkedAt, error, rows] = await Promise.all([
    setting(db, CHECKED_AT),
    setting(db, ERROR),
    db
      .select({
        readAt: rulesSnapshot.readAt,
        bundle: rulesSnapshot.bundle,
        dataVersion: rulesSnapshot.dataVersion,
        factions: count('factions'),
        datasheets: count('datasheets'),
        weapons: sql<number>`(select coalesce(sum(jsonb_array_length(sheet -> 'weapons')), 0)::int from jsonb_array_elements(${rulesSnapshot.data} -> 'datasheets') as sheet)`,
      })
      .from(rulesSnapshot),
  ]);
  const row = rows[0];
  return {
    checkedAt,
    readAt: row?.readAt.toISOString() ?? null,
    bundle: row?.bundle ?? null,
    dataVersion: row?.dataVersion ?? null,
    counts:
      row === undefined
        ? null
        : {
            factions: row.factions,
            datasheets: row.datasheets,
            weapons: row.weapons,
          },
    error,
  };
}

/**
 * True when 39k.pro hasn't been checked in the last 24 hours, or no rules are stored the current
 * way (never read, or read before RULES_FORMAT changed): those are checked at once (hourly).
 */
export async function rulesDue(db: Db, now: Date): Promise<boolean> {
  const [at, format] = await Promise.all([setting(db, CHECKED_AT), setting(db, FORMAT)]);
  if (format !== `v${String(RULES_FORMAT)}`) return true;
  return at === null || now.getTime() - Date.parse(at) >= DAY_MS;
}

/**
 * Checks 39k.pro: when its script changed (or RULES_FORMAT did), reads it and replaces the stored
 * rules and each faction's detachments (then lists take the detachments' spellings). Any failure
 * (download, a changed shape) keeps the old ones and is recorded as the error.
 */
export async function syncRules(
  db: Db,
  client: RulesClient,
  now: Date,
  format = RULES_FORMAT,
): Promise<RulesStatus> {
  let error: string | null = null;
  try {
    const bundle = bundleUrlOf(await client.homePage());
    const [stored] = await db.select({ bundle: rulesSnapshot.bundle }).from(rulesSnapshot);
    const storedFormat = await setting(db, FORMAT);
    if (stored?.bundle !== bundle || storedFormat !== `v${String(format)}`) {
      const { dataVersion, data, detachments } = readRulesBundle(await client.bundle(bundle));
      const values = { bundle, dataVersion, readAt: now, data };
      await db.transaction(async (tx) => {
        await tx
          .insert(rulesSnapshot)
          .values({ id: 1, ...values })
          .onConflictDoUpdate({ target: rulesSnapshot.id, set: values });
        await replaceFactionDetachments(tx, detachments);
      });
      await putSetting(db, FORMAT, `v${String(format)}`, now);
      await tidyDetachments(db);
    }
  } catch (caught) {
    error = messageOf(caught);
  }
  await putSetting(db, ERROR, error, now);
  await putSetting(db, CHECKED_AT, now.toISOString(), now);
  return rulesStatus(db);
}

/** The stored data, read once per version (it is a few MB). */
const cache = new WeakMap<Db, { key: string; readAt: Date; data: UnitData }>();

/** The stored unit data and when it was read, or null before the first read. */
export async function loadUnits(db: Db): Promise<{ readAt: Date; data: UnitData } | null> {
  const [head] = await db
    .select({ readAt: rulesSnapshot.readAt, bundle: rulesSnapshot.bundle })
    .from(rulesSnapshot);
  if (head === undefined) return null;
  const key = `${head.readAt.toISOString()} ${head.bundle}`;
  const cached = cache.get(db);
  if (cached?.key === key) return cached;
  const [row] = await db.select({ data: rulesSnapshot.data }).from(rulesSnapshot);
  if (row === undefined) return null;
  const parsed = UnitDataSchema.safeParse(row.data);
  // Data stored in an older shape: as if not read yet (the next check reads it again).
  if (!parsed.success) return null;
  const loaded = { key, readAt: head.readAt, data: parsed.data };
  cache.set(db, loaded);
  return loaded;
}
