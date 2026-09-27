import {
  countedFaction,
  eventPhase,
  isBigEvent,
  type EventSizeRule,
  type MetaPlayerRow,
  type MetaQuery,
} from '@bcp/shared';
import { and, gt, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, events, players, teams } from '../db/schema';
import { storedCurrentList } from './lists';

const DAY_MS = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The counted players (at least one game) of big events starting in the range (default: the last
 * 90 days), with resolved faction, their current list's detachments, team and team placing. One
 * query; the aggregation happens in computeMeta / computeTeamMeta.
 */
export async function loadMetaRows(
  db: Db,
  query: MetaQuery,
  rule: EventSizeRule,
  today: Date,
): Promise<{ rows: MetaPlayerRow[]; eventsInRange: number; eventsLoaded: number }> {
  const to = query.to ?? isoDay(today);
  const from = query.from ?? isoDay(new Date(today.getTime() - 90 * DAY_MS));
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const inRange = (
    await db
      .select({
        id: events.id,
        roundCount: events.roundCount,
        playerCount: events.playerCount,
        isTeamEvent: events.isTeamEvent,
        startDate: events.startDate,
        endDate: events.endDate,
        ended: events.ended,
      })
      .from(events)
      .where(
        and(gte(events.startDate, new Date(`${from}T00:00:00.000Z`)), lt(events.startDate, end)),
      )
  ).filter(
    (event) =>
      isBigEvent(event, rule) &&
      (query.type === 'all' || event.isTeamEvent === (query.type === 'teams')),
  );
  const ids = inRange.map((event) => event.id);
  if (ids.length === 0) return { rows: [], eventsInRange: 0, eventsLoaded: 0 };
  const teamEvents = new Set(inRange.filter((event) => event.isTeamEvent).map((event) => event.id));
  const finished = new Set(
    inRange.filter((event) => eventPhase(event, today) === 'finished').map((event) => event.id),
  );

  const [loaded, found] = await Promise.all([
    db
      .selectDistinct({ eventId: players.eventId })
      .from(players)
      .where(inArray(players.eventId, ids)),
    db
      .select({
        eventId: players.eventId,
        teamId: players.teamId,
        teamPlacing: teams.placing,
        faction: players.faction,
        parsedArmy: armyLists.parsedArmy,
        detachments: armyLists.detachments,
        wins: players.wins,
        losses: players.losses,
        draws: players.draws,
      })
      .from(players)
      .leftJoin(teams, sql`${teams.id} = ${players.teamId}`)
      .leftJoin(armyLists, storedCurrentList)
      .where(
        and(
          inArray(players.eventId, ids),
          gt(sql`${players.wins} + ${players.losses} + ${players.draws}`, 0),
        ),
      ),
  ]);

  const rows = found.map((row) => {
    const { faction } = countedFaction(row.faction, row.parsedArmy);
    return {
      eventId: row.eventId,
      isTeamEvent: teamEvents.has(row.eventId),
      eventFinished: finished.has(row.eventId),
      teamId: row.teamId,
      teamPlacing: row.teamPlacing,
      faction,
      detachments: row.detachments ?? [],
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
    };
  });
  return { rows, eventsInRange: inRange.length, eventsLoaded: loaded.length };
}
