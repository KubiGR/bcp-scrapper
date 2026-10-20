import { computeElo, type EloGame, type EloRating } from '@bcp/shared';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { events, games, players } from '../db/schema';

const playerA = alias(players, 'player_a');
const playerB = alias(players, 'player_b');

/**
 * Our Elo, by BCP account: every stored game with a result between two players with accounts,
 * oldest event first, then by round. Byes and unplayed games don't count.
 */
export async function loadElo(db: Db): Promise<Map<string, EloRating>> {
  const rows = await db
    .select({ a: playerA.bcpUserId, b: playerB.bcpUserId, result: games.result })
    .from(games)
    .innerJoin(events, eq(events.id, games.eventId))
    .innerJoin(playerA, eq(playerA.id, games.playerAId))
    .innerJoin(playerB, eq(playerB.id, games.playerBId))
    .where(and(isNotNull(games.result), isNotNull(playerA.bcpUserId), isNotNull(playerB.bcpUserId)))
    .orderBy(asc(events.startDate), asc(events.id), asc(games.round), asc(games.id));
  return computeElo(rows as EloGame[]);
}

/** Loads our Elo once and again only after the stored games change (added, removed or updated). */
export function eloLoader(db: Db): () => Promise<Map<string, EloRating>> {
  let cached: { key: string; ratings: Map<string, EloRating> } | null = null;
  return async () => {
    const [stamp] = await db
      .select({
        n: sql<number>`count(*)::int`,
        at: sql<string | null>`max(${games.updatedAt})::text`,
      })
      .from(games);
    const key = `${String(stamp?.n ?? 0)}|${stamp?.at ?? ''}`;
    if (cached?.key !== key) cached = { key, ratings: await loadElo(db) };
    return cached.ratings;
  };
}
