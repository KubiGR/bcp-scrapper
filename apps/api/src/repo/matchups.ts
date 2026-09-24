import type { MatchupGame, PairingsState } from '@bcp/shared';
import { isBigEvent, type EventSizeRule } from '@bcp/shared';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { events, fetchQueue, games, players, teams } from '../db/schema';
import type { EventRow } from './events';
import { storedPairingsSummary } from './pairings';

/** Every stored game of the given events, with both players' faction, disposition and team. */
export async function loadMatchupGames(db: Db, eventIds: string[]): Promise<MatchupGame[]> {
  if (eventIds.length === 0) return [];
  const pa = alias(players, 'pa');
  const pb = alias(players, 'pb');
  const ta = alias(teams, 'ta');
  const tb = alias(teams, 'tb');
  const rows = await db
    .select({
      id: games.id,
      eventId: games.eventId,
      eventName: events.name,
      round: games.round,
      tableNo: games.tableNo,
      pointsA: games.gamePointsA,
      pointsB: games.gamePointsB,
      result: games.result,
      aId: games.playerAId,
      aName: pa.name,
      aFaction: pa.faction,
      aDisposition: pa.disposition,
      aTeam: ta.name,
      bId: games.playerBId,
      bName: pb.name,
      bFaction: pb.faction,
      bDisposition: pb.disposition,
      bTeam: tb.name,
    })
    .from(games)
    .innerJoin(events, eq(events.id, games.eventId))
    .leftJoin(pa, eq(pa.id, games.playerAId))
    .leftJoin(pb, eq(pb.id, games.playerBId))
    .leftJoin(ta, eq(ta.id, pa.teamId))
    .leftJoin(tb, eq(tb.id, pb.teamId))
    .where(inArray(games.eventId, eventIds));
  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    eventName: row.eventName,
    round: row.round,
    tableNo: row.tableNo,
    pointsA: row.pointsA,
    pointsB: row.pointsB,
    result: row.result,
    a: {
      playerId: row.aId,
      name: row.aName ?? 'Unknown player',
      faction: row.aFaction ?? null,
      disposition: row.aDisposition ?? null,
      teamName: row.aTeam ?? null,
    },
    b:
      row.bId === null
        ? null
        : {
            playerId: row.bId,
            name: row.bName ?? 'Unknown player',
            faction: row.bFaction ?? null,
            disposition: row.bDisposition ?? null,
            teamName: row.bTeam ?? null,
          },
  }));
}

/**
 * Each event's pairings state: fetching (open event/pairings jobs), synced (every round fetched
 * through the queue), partial (some rounds stored, or a failed fetch), or missing.
 */
export async function pairingsStates(
  db: Db,
  eventIds: string[],
): Promise<Map<string, PairingsState>> {
  const states = new Map<string, PairingsState>();
  if (eventIds.length === 0) return states;
  const [rows, open] = await Promise.all([
    db
      .select({ id: events.id, syncedAt: events.pairingsSyncedAt })
      .from(events)
      .where(inArray(events.id, eventIds)),
    db
      .selectDistinct({ eventId: fetchQueue.eventId })
      .from(fetchQueue)
      .where(
        and(
          inArray(fetchQueue.eventId, eventIds),
          inArray(fetchQueue.kind, ['event', 'pairings-round']),
          inArray(fetchQueue.status, ['queued', 'fetching']),
        ),
      ),
  ]);
  const fetching = new Set(open.map((row) => row.eventId));
  const notFetching = rows.filter((row) => !fetching.has(row.id) && !row.syncedAt);
  const summaries = await Promise.all(notFetching.map((row) => storedPairingsSummary(db, row.id)));
  const storedByEvent = new Map(notFetching.map((row, index) => [row.id, summaries[index]]));
  for (const row of rows) {
    if (fetching.has(row.id)) states.set(row.id, 'fetching');
    else if (row.syncedAt) states.set(row.id, 'synced');
    else {
      const stored = storedByEvent.get(row.id);
      states.set(row.id, (stored?.rounds ?? 0) > 0 ? 'partial' : 'missing');
    }
  }
  return states;
}

/** Team events starting in [from, to] (dates), big only, newest first. */
export async function teamEventsInRange(
  db: Db,
  range: { from: string; to: string },
  rule: EventSizeRule,
): Promise<EventRow[]> {
  const start = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const rows = await db
    .select()
    .from(events)
    .where(
      and(eq(events.isTeamEvent, true), gte(events.startDate, start), lt(events.startDate, end)),
    )
    .orderBy(desc(events.startDate), events.id);
  return rows.filter((row) => isBigEvent(row, rule));
}
