import type { MatchupGame, PairingsState } from '@bcp/shared';
import { isBigEvent, knownDisposition, type EventSizeRule } from '@bcp/shared';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client';
import { armyLists, events, fetchQueue, games, players, teams } from '../db/schema';
import { armyRules } from './detachment-links';
import { eventPairingsJobs } from './fetch-queue';
import type { EventRow } from './events';
import { storedPairingsSummary } from './pairings';

/** Every stored game of the given events, with both players' faction, disposition and team. */
export async function loadMatchupGames(db: Db, eventIds: string[]): Promise<MatchupGame[]> {
  if (eventIds.length === 0) return [];
  const pa = alias(players, 'pa');
  const pb = alias(players, 'pb');
  const ta = alias(teams, 'ta');
  const tb = alias(teams, 'tb');
  const la = alias(armyLists, 'la');
  const lb = alias(armyLists, 'lb');
  const rules = await armyRules(db);
  /** A side's army, and its detachments when they count (see `armyRules`). */
  const armyOf = (faction: string | null, army: string | null, detachments: string[] | null) => {
    const counted = rules.army(faction, army, detachments ?? []);
    return { ...counted, detachments: rules.detachments(counted.faction, detachments ?? []) };
  };
  const rows = await db
    .select({
      id: games.id,
      eventId: games.eventId,
      eventName: events.name,
      eventStartDate: events.startDate,
      round: games.round,
      tableNo: games.tableNo,
      pointsA: games.gamePointsA,
      pointsB: games.gamePointsB,
      result: games.result,
      aId: games.playerAId,
      aName: pa.name,
      aFaction: pa.faction,
      aDisposition: pa.disposition,
      aArmy: la.parsedArmy,
      aDetachments: la.detachments,
      aParsedDisposition: la.parsedDisposition,
      aTeam: ta.name,
      bId: games.playerBId,
      bName: pb.name,
      bFaction: pb.faction,
      bDisposition: pb.disposition,
      bArmy: lb.parsedArmy,
      bDetachments: lb.detachments,
      bParsedDisposition: lb.parsedDisposition,
      bTeam: tb.name,
    })
    .from(games)
    .innerJoin(events, eq(events.id, games.eventId))
    .leftJoin(pa, eq(pa.id, games.playerAId))
    .leftJoin(pb, eq(pb.id, games.playerBId))
    .leftJoin(ta, eq(ta.id, pa.teamId))
    .leftJoin(tb, eq(tb.id, pb.teamId))
    // Only a player's current list (see storedCurrentList).
    .leftJoin(la, and(eq(la.playerId, pa.id), eq(la.listId, pa.listId)))
    .leftJoin(lb, and(eq(lb.playerId, pb.id), eq(lb.listId, pb.listId)))
    .where(inArray(games.eventId, eventIds));
  return rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    eventName: row.eventName,
    eventStartDate: row.eventStartDate.toISOString(),
    round: row.round,
    tableNo: row.tableNo,
    pointsA: row.pointsA,
    pointsB: row.pointsB,
    result: row.result,
    a: {
      playerId: row.aId,
      name: row.aName ?? 'Unknown player',
      ...armyOf(row.aFaction ?? null, row.aArmy ?? null, row.aDetachments ?? null),
      disposition: row.aDisposition ?? knownDisposition(row.aParsedDisposition ?? null),
      teamName: row.aTeam ?? null,
    },
    b:
      row.bId === null
        ? null
        : {
            playerId: row.bId,
            name: row.bName ?? 'Unknown player',
            ...armyOf(row.bFaction ?? null, row.bArmy ?? null, row.bDetachments ?? null),
            disposition: row.bDisposition ?? knownDisposition(row.bParsedDisposition ?? null),
            teamName: row.bTeam ?? null,
          },
  }));
}

export interface EventPairingsState {
  state: PairingsState;
  /** When pairings were last fully synced through the queue; set even while a resync (a refresh)
   * is in flight, so callers can tell "was synced" apart from the currently displayed state. */
  syncedAt: Date | null;
}

/**
 * Each event's pairings state: fetching (open event/pairings jobs), synced (every round fetched
 * through the queue), partial (some rounds stored, or a failed pairings job), or missing.
 */
export async function pairingsStates(
  db: Db,
  eventIds: string[],
): Promise<Map<string, EventPairingsState>> {
  const states = new Map<string, EventPairingsState>();
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
  const [summaries, jobs] = await Promise.all([
    Promise.all(notFetching.map((row) => storedPairingsSummary(db, row.id))),
    Promise.all(notFetching.map((row) => eventPairingsJobs(db, row.id))),
  ]);
  const storedByEvent = new Map(notFetching.map((row, index) => [row.id, summaries[index]]));
  const jobsByEvent = new Map(notFetching.map((row, index) => [row.id, jobs[index]]));
  for (const row of rows) {
    if (fetching.has(row.id)) states.set(row.id, { state: 'fetching', syncedAt: row.syncedAt });
    else if (row.syncedAt) states.set(row.id, { state: 'synced', syncedAt: row.syncedAt });
    else {
      const stored = storedByEvent.get(row.id);
      const failed = jobsByEvent.get(row.id)?.failed ?? 0;
      const state: PairingsState = (stored?.rounds ?? 0) > 0 || failed > 0 ? 'partial' : 'missing';
      states.set(row.id, { state, syncedAt: null });
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
