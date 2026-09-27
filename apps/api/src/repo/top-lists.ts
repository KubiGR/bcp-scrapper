import {
  isBigEvent,
  knownDisposition,
  resolveFaction,
  TOP_LISTS_LIMIT,
  type EventSizeRule,
  type PlayerSearchQuery,
  type PlayerSearchResponse,
  type TopListPlayer,
} from '@bcp/shared';
import { and, desc, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, events, players, teams } from '../db/schema';
import { latestQueueRowsByPlayer } from './fetch-queue';
import { storedCurrentList } from './lists';
import { listStateOf } from './participants';

const DAY_MS = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const anyOf = (chosen: string[], value: string | null) =>
  chosen.length === 0 || (value !== null && chosen.includes(value));

const sorted = (values: Iterable<string>) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

/**
 * Players of big events starting in the range (default: the last 90 days) who went X-n or better,
 * filtered by faction (the guessed army counts), disposition and detachment (only read lists).
 * Best win/loss ratio first (draws count half), then most wins, then newest event; at most
 * TOP_LISTS_LIMIT. One query for
 * the qualifying players; list states only for the rows returned.
 */
export async function searchTopLists(
  db: Db,
  query: PlayerSearchQuery,
  rule: EventSizeRule,
  today: Date,
): Promise<PlayerSearchResponse> {
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
      })
      .from(events)
      .where(
        and(gte(events.startDate, new Date(`${from}T00:00:00.000Z`)), lt(events.startDate, end)),
      )
  ).filter((event) => isBigEvent(event, rule));
  const ids = inRange.map((event) => event.id);
  if (ids.length === 0) {
    return {
      players: [],
      truncated: false,
      factionOptions: [],
      detachmentOptions: [],
      eventsInRange: 0,
      eventsLoaded: 0,
    };
  }

  const [loaded, rows] = await Promise.all([
    db
      .selectDistinct({ eventId: players.eventId })
      .from(players)
      .where(inArray(players.eventId, ids)),
    db
      .select({
        id: players.id,
        eventId: players.eventId,
        name: players.name,
        teamId: players.teamId,
        teamName: teams.name,
        teamPlacing: teams.placing,
        faction: players.faction,
        parentFaction: players.parentFaction,
        placing: players.placing,
        wins: players.wins,
        losses: players.losses,
        draws: players.draws,
        dropped: players.dropped,
        disposition: players.disposition,
        listId: players.listId,
        storedListId: armyLists.listId,
        parsedArmy: armyLists.parsedArmy,
        detachments: armyLists.detachments,
        parsedDisposition: armyLists.parsedDisposition,
        eventName: events.name,
        eventStartDate: events.startDate,
      })
      .from(players)
      .innerJoin(events, sql`${events.id} = ${players.eventId}`)
      .leftJoin(teams, sql`${teams.id} = ${players.teamId}`)
      .leftJoin(armyLists, storedCurrentList)
      .where(
        and(
          inArray(players.eventId, ids),
          lte(players.losses, query.maxLosses),
          // qualifiesForMaxLosses: at least one game played.
          gt(sql`${players.wins} + ${players.losses} + ${players.draws}`, 0),
        ),
      )
      // Best record first: win/loss ratio with draws as half a win, then more wins, then newest.
      .orderBy(
        desc(
          sql`(${players.wins} + ${players.draws} * 0.5) / (${players.wins} + ${players.losses} + ${players.draws})`,
        ),
        desc(players.wins),
        desc(events.startDate),
        players.name,
      ),
  ]);

  const qualifying = rows.map((row) => ({
    row,
    ...resolveFaction(row.faction, row.parsedArmy),
    disposition: row.disposition ?? knownDisposition(row.parsedDisposition),
    detachments: row.detachments ?? [],
  }));
  const matching = qualifying.filter(
    (player) =>
      anyOf(query.factions, player.faction) &&
      anyOf(query.dispositions, player.disposition) &&
      (query.detachments.length === 0 ||
        player.detachments.some((name) => query.detachments.includes(name))),
  );
  const page = matching.slice(0, TOP_LISTS_LIMIT);

  // Queue states only for the events on this page.
  const queues = new Map(
    await Promise.all(
      [...new Set(page.map((player) => player.row.eventId))].map(
        async (eventId) => [eventId, await latestQueueRowsByPlayer(db, eventId)] as const,
      ),
    ),
  );
  const result: TopListPlayer[] = page.map(
    ({ row, faction, factionGuessed, disposition, detachments }) => ({
      bcpId: row.id,
      name: row.name,
      teamName: row.teamName,
      teamId: row.teamId,
      teamPlacing: row.teamPlacing,
      faction,
      factionGuessed,
      parentFaction: row.parentFaction,
      placing: row.placing,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      dropped: row.dropped,
      disposition,
      detachments,
      ...listStateOf(row.listId, row.storedListId, queues.get(row.eventId)?.get(row.id)),
      eventId: row.eventId,
      eventName: row.eventName,
      eventStartDate: row.eventStartDate.toISOString(),
    }),
  );

  return {
    players: result,
    truncated: matching.length > TOP_LISTS_LIMIT,
    factionOptions: sorted(qualifying.flatMap((p) => (p.faction === null ? [] : [p.faction]))),
    detachmentOptions: sorted(qualifying.flatMap((p) => p.detachments)),
    eventsInRange: inRange.length,
    eventsLoaded: loaded.length,
  };
}
