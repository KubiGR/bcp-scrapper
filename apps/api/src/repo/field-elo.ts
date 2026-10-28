import { eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { players, wh40kElo } from '../db/schema';

/** At least this share of an event's players must be rated for its field strength to count. */
const RATED_SHARE = 0.5;

/** Each event's field strength: its rated players' average wh40k-elo, when enough are rated. */
export async function fieldElos(db: Db, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      eventId: players.eventId,
      average: sql<number | null>`avg(${wh40kElo.elo})::float`,
      rated: sql<number>`count(${wh40kElo.elo})::int`,
      all: sql<number>`count(*)::int`,
    })
    .from(players)
    .leftJoin(wh40kElo, eq(wh40kElo.userId, players.bcpUserId))
    .where(inArray(players.eventId, ids))
    .groupBy(players.eventId);
  return new Map(
    rows.flatMap((row) =>
      row.average !== null && row.rated >= row.all * RATED_SHARE
        ? [[row.eventId, row.average] as const]
        : [],
    ),
  );
}
