import { and, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { players } from '../db/schema';

const userIdOf = sql<string | null>`${players.raw} -> 'user' ->> 'id'`;

/**
 * Stores BCP's account id for players saved before it was kept (from their raw BCP data). Runs at
 * startup; returns how many players it filled in.
 */
export async function backfillPlayerUserIds(db: Db): Promise<number> {
  const updated = await db
    .update(players)
    .set({ bcpUserId: userIdOf })
    .where(and(isNull(players.bcpUserId), sql`${userIdOf} is not null`))
    .returning({ id: players.id });
  return updated.length;
}
