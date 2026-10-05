import {
  isBigEvent,
  knownDisposition,
  TOP_LISTS_LIMIT,
  type EventSizeRule,
  UNKNOWN_FILTER,
  type PlayerSearchQuery,
  type PlayerSearchResponse,
  type TopListPlayer,
} from '@bcp/shared';
import { and, desc, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, events, players, teams } from '../db/schema';
import { latestQueueRowsByPlayer } from './fetch-queue';
import { armyRules, foreignDetachmentCheck } from './detachment-links';
import { storedCurrentList } from './lists';
import { listStateOf } from './participants';

const DAY_MS = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Whether a player's detachments pass the filter: any listed one, or (`exact`) exactly the listed
 * set, as an archetype row counts them; `(unknown)` matches a player without detachments or with
 * one that isn't English, as Meta counts them.
 */
function detachmentsMatch(
  query: PlayerSearchQuery,
  detachments: string[],
  foreign: (name: string) => boolean,
): boolean {
  const wanted = query.detachments;
  if (wanted.length === 0) return true;
  if (detachments.length === 0 || detachments.some(foreign)) {
    if (wanted.includes(UNKNOWN_FILTER)) return true;
  }
  if (detachments.length === 0) return false;
  if (query.detachmentsMatch === 'exact') {
    const key = (list: string[]) => [...list].sort().join('\u0000');
    return key(detachments) === key(wanted);
  }
  return detachments.some((name) => wanted.includes(name));
}

/** Any chosen value matches; `(unknown)` matches a missing one. */
const anyOf = (chosen: string[], value: string | null) =>
  chosen.length === 0 ||
  (value === null ? chosen.includes(UNKNOWN_FILTER) : chosen.includes(value));

const sorted = (values: Iterable<string>) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

/**
 * Players of big events starting in the range (default: the last 90 days) who went X-n or better,
 * filtered by faction (the guessed army counts), disposition and detachment (only read lists).
 * Best record first, like standings (most wins, then draws, then fewest losses), then newest
 * event; at most TOP_LISTS_LIMIT. One query for the qualifying players; list states only for the
 * rows returned.
 */
export async function searchTopLists(
  db: Db,
  query: PlayerSearchQuery,
  rule: EventSizeRule,
  today: Date,
): Promise<PlayerSearchResponse> {
  const rules = await armyRules(db);
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
      })
      .from(events)
      .where(
        and(gte(events.startDate, new Date(`${from}T00:00:00.000Z`)), lt(events.startDate, end)),
      )
  ).filter(
    (event) =>
      isBigEvent(event, rule) &&
      (query.type === undefined ||
        query.type === 'all' ||
        event.isTeamEvent === (query.type === 'teams')),
  );
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

  const [loaded, rows, foreign] = await Promise.all([
    db
      .selectDistinct({ eventId: players.eventId })
      .from(players)
      .where(inArray(players.eventId, ids)),
    db
      .select({
        id: players.id,
        eventId: players.eventId,
        name: players.name,
        bcpUserId: players.bcpUserId,
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
        eventPlayerCount: events.playerCount,
        eventTeamCount: events.teamCount,
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
      // Best record first, like standings: most wins, then draws, then fewest losses; then newest.
      .orderBy(
        desc(players.wins),
        desc(players.draws),
        players.losses,
        desc(events.startDate),
        players.name,
      ),
    query.detachments.includes(UNKNOWN_FILTER)
      ? foreignDetachmentCheck(db)
      : (_name: string) => false,
  ]);

  const qualifying = rows.map((row) => ({
    row,
    ...rules.army(row.faction, row.parsedArmy, row.detachments ?? []),
    disposition: row.disposition ?? knownDisposition(row.parsedDisposition),
    detachments: row.detachments ?? [],
  }));
  const matching = qualifying.filter(
    (player) =>
      anyOf(query.factions, player.faction) &&
      anyOf(query.dispositions, player.disposition) &&
      detachmentsMatch(query, player.detachments, foreign),
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
      bcpUserId: row.bcpUserId,
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
      eventPlayerCount: row.eventPlayerCount,
      eventTeamCount: row.eventTeamCount,
    }),
  );

  return {
    players: result,
    truncated: matching.length > TOP_LISTS_LIMIT,
    factionOptions: sorted(qualifying.flatMap((p) => (p.faction === null ? [] : [p.faction]))),
    // The chosen factions' detachments only (all factions' when none is chosen).
    detachmentOptions: sorted(
      qualifying
        .filter((player) => anyOf(query.factions, player.faction))
        .flatMap((player) => player.detachments),
    ),
    eventsInRange: inRange.length,
    eventsLoaded: loaded.length,
  };
}
