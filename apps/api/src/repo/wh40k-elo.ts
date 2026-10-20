import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { appSettings, players, wh40kElo } from '../db/schema';
import type { Wh40kEloClient, Wh40kEloPlayer } from '../wh40k-elo/client';

/** When an import was last tried, worked or not (ISO). */
const TRIED_AT = 'wh40kEloTriedAt';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const CHUNK = 1000;

/** One player's wh40k-elo rating. */
export interface Wh40kEloRating {
  elo: number;
  games: number;
}

async function triedAt(db: Db): Promise<number | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, TRIED_AT));
  return typeof row?.value === 'string' ? Date.parse(row.value) : null;
}

/** Due a day after the last import, or an hour after a failed try. */
export async function wh40kEloDue(db: Db, now: Date): Promise<boolean> {
  const [tried, [last]] = await Promise.all([
    triedAt(db),
    db.select({ at: sql<string | null>`max(${wh40kElo.importedAt})::text` }).from(wh40kElo),
  ]);
  const imported = last?.at ? Date.parse(last.at) : null;
  if (imported !== null && now.getTime() - imported < DAY_MS) return false;
  return tried === null || now.getTime() - tried >= HOUR_MS;
}

/**
 * Reads the whole leaderboard, page by page with `pause` between pages, and replaces the stored
 * ratings with it. A failed page throws and keeps the last import. Returns how many players.
 */
export async function importWh40kElo(
  db: Db,
  client: Wh40kEloClient,
  now: Date,
  pause: () => Promise<void>,
): Promise<number> {
  const value = now.toISOString();
  await db
    .insert(appSettings)
    .values({ key: TRIED_AT, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
  const byUser = new Map<string, Wh40kEloPlayer>();
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    if (page > 1) await pause();
    const answer = await client.leaderboard(page);
    totalPages = answer.totalPages;
    // The board can shift while it's read: a player met twice keeps their first (higher) row.
    for (const player of answer.players) {
      if (!byUser.has(player.userId)) byUser.set(player.userId, player);
    }
  }
  const rows = [...byUser.values()].map((player) => ({ ...player, importedAt: now }));
  await db.transaction(async (tx) => {
    await tx.delete(wh40kElo);
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(wh40kElo).values(rows.slice(i, i + CHUNK));
    }
  });
  return rows.length;
}

/** The stored ratings by BCP account, read again only after a new import. */
export function wh40kEloLoader(db: Db): () => Promise<Map<string, Wh40kEloRating>> {
  let cached: { key: string; ratings: Map<string, Wh40kEloRating> } | null = null;
  return async () => {
    const [stamp] = await db
      .select({
        n: sql<number>`count(*)::int`,
        at: sql<string | null>`max(${wh40kElo.importedAt})::text`,
      })
      .from(wh40kElo);
    const key = `${String(stamp?.n ?? 0)}|${stamp?.at ?? ''}`;
    if (cached?.key !== key) {
      const rows = await db
        .select({ userId: wh40kElo.userId, elo: wh40kElo.elo, games: wh40kElo.games })
        .from(wh40kElo);
      cached = {
        key,
        ratings: new Map(rows.map((row) => [row.userId, { elo: row.elo, games: row.games }])),
      };
    }
    return cached.ratings;
  };
}

/** The rounded rating of every player we store who has one, by BCP account, for their badges. */
export async function storedPlayersElo(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ userId: wh40kElo.userId, elo: sql<number>`round(${wh40kElo.elo})::int` })
    .from(wh40kElo)
    .where(sql`exists (select 1 from ${players} where ${players.bcpUserId} = ${wh40kElo.userId})`);
  return Object.fromEntries(rows.map((row) => [row.userId, row.elo]));
}
