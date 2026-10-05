import {
  addDays,
  computeRankings,
  eventPhase,
  isBigEvent,
  rankingCutoff,
  RANKING_DAYS,
  TOP_RANKS,
  type EventSizeRule,
  type PlayerRanking,
  type RankedPlayer,
  type RankingResult,
  type RankingsQuery,
  type RankingsResponse,
  type TopRanks,
} from '@bcp/shared';
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyRules } from './detachment-links';
import { armyLists, events, players, teams } from '../db/schema';
import { storedCurrentList } from './lists';

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** The counted events of the last 12 months: big and finished. */
async function countedEvents(db: Db, rule: EventSizeRule, today: Date) {
  const rows = await db
    .select({
      id: events.id,
      name: events.name,
      startDate: events.startDate,
      endDate: events.endDate,
      ended: events.ended,
      roundCount: events.roundCount,
      playerCount: events.playerCount,
      isTeamEvent: events.isTeamEvent,
    })
    .from(events)
    .where(gt(events.startDate, new Date(`${rankingCutoff(today)}T23:59:59.999Z`)));
  return rows.filter((event) => isBigEvent(event, rule) && eventPhase(event, today) === 'finished');
}

/** Placed entries per event: players at singles events, teams at team events. */
async function fields(db: Db, ids: string[]) {
  const [playerCounts, teamCounts] = await Promise.all([
    db
      .select({ eventId: players.eventId, n: sql<number>`count(*)::int` })
      .from(players)
      .where(and(inArray(players.eventId, ids), isNotNull(players.placing)))
      .groupBy(players.eventId),
    db
      .select({ eventId: teams.eventId, n: sql<number>`count(*)::int` })
      .from(teams)
      .where(and(inArray(teams.eventId, ids), isNotNull(teams.placing)))
      .groupBy(teams.eventId),
  ]);
  return {
    singles: new Map(playerCounts.map((row) => [row.eventId, row.n])),
    teams: new Map(teamCounts.map((row) => [row.eventId, row.n])),
  };
}

const resultColumns = {
  playerId: players.id,
  userId: players.bcpUserId,
  name: players.name,
  eventId: players.eventId,
  playerPlacing: players.placing,
  teamName: teams.name,
  teamPlacing: teams.placing,
  faction: players.faction,
  parsedArmy: armyLists.parsedArmy,
  detachments: armyLists.detachments,
  storedListId: armyLists.listId,
};

/** Every ranked player, best first (spec §3). */
export async function loadRankings(
  db: Db,
  rule: EventSizeRule,
  today: Date,
): Promise<RankedPlayer[]> {
  const rules = await armyRules(db);
  const counted = await countedEvents(db, rule, today);
  if (counted.length === 0) return [];
  const ids = counted.map((event) => event.id);
  const byId = new Map(counted.map((event) => [event.id, event]));
  const [rows, field] = await Promise.all([
    db
      .select(resultColumns)
      .from(players)
      .leftJoin(teams, eq(teams.id, players.teamId))
      .leftJoin(armyLists, storedCurrentList)
      .where(and(inArray(players.eventId, ids), isNotNull(players.bcpUserId))),
    fields(db, ids),
  ]);
  const results: RankingResult[] = rows.flatMap((row) => {
    const event = byId.get(row.eventId);
    if (event === undefined || row.userId === null) return [];
    const placing = event.isTeamEvent ? row.teamPlacing : row.playerPlacing;
    const n = (event.isTeamEvent ? field.teams : field.singles).get(event.id) ?? 0;
    if (placing === null || n === 0) return [];
    return [
      {
        userId: row.userId,
        name: row.name,
        eventId: event.id,
        eventName: event.name,
        eventStart: isoDay(event.startDate),
        isTeamEvent: event.isTeamEvent,
        teamName: event.isTeamEvent ? row.teamName : null,
        placing,
        field: n,
        players: event.playerCount,
        faction: rules.army(row.faction, row.parsedArmy, row.detachments ?? []).faction,
      },
    ];
  });
  return computeRankings(results, today);
}

const withoutScores = ({ scores: _scores, best, ...player }: RankedPlayer) => ({
  ...player,
  best: {
    eventId: best.eventId,
    eventName: best.eventName,
    eventStart: best.eventStart,
    isTeamEvent: best.isTeamEvent,
    teamName: best.teamName,
    placing: best.placing,
    field: best.field,
    score: best.score,
    counts: best.counts,
  },
});

/** A page of the ranking, filtered by name (plain, case-insensitive) and faction. */
export function rankingsPage(ranked: RankedPlayer[], query: RankingsQuery): RankingsResponse {
  const search = query.search?.toLowerCase() ?? '';
  const matching = ranked.filter(
    (player) =>
      (search === '' || player.name.toLowerCase().includes(search)) &&
      (query.faction === undefined ||
        player.scores.some((score) => score.faction === query.faction)),
  );
  return {
    players: matching.slice(query.offset, query.offset + query.limit).map(withoutScores),
    total: matching.length,
    ranked: ranked.length,
    factionOptions: [
      ...new Set(ranked.flatMap((p) => p.scores.flatMap((s) => (s.faction ? [s.faction] : [])))),
    ].sort((a, b) => a.localeCompare(b)),
  };
}

export function topRanks(ranked: RankedPlayer[]): TopRanks {
  return {
    ranks: Object.fromEntries(ranked.slice(0, TOP_RANKS).map((p) => [p.userId, p.rank])),
  };
}

/** A player's rank and every event they played, counted or not; null for an unknown account. */
export async function playerRanking(
  db: Db,
  ranked: RankedPlayer[],
  userId: string,
): Promise<PlayerRanking | null> {
  const rules = await armyRules(db);
  const rows = await db
    .select({
      ...resultColumns,
      eventName: events.name,
      startDate: events.startDate,
      isTeamEvent: events.isTeamEvent,
    })
    .from(players)
    .innerJoin(events, eq(events.id, players.eventId))
    .leftJoin(teams, eq(teams.id, players.teamId))
    .leftJoin(armyLists, storedCurrentList)
    .where(eq(players.bcpUserId, userId))
    .orderBy(sql`${events.startDate} desc`);
  if (rows.length === 0) return null;
  const field = await fields(db, [...new Set(rows.map((row) => row.eventId))]);
  const own = ranked.find((player) => player.userId === userId);
  const scores = new Map(own?.scores.map((score) => [score.eventId, score]));
  const counting = own?.scores.filter((score) => score.counts) ?? [];
  const oldest = counting.map((score) => score.eventStart).sort()[0];
  return {
    userId,
    name: own?.name ?? rows[0]?.name ?? '',
    rank: own?.rank ?? null,
    ranked: ranked.length,
    points: own?.points ?? 0,
    dropsOn: oldest === undefined ? null : addDays(oldest, RANKING_DAYS),
    history: rows.map((row) => {
      const score = scores.get(row.eventId);
      const placing = row.isTeamEvent ? row.teamPlacing : row.playerPlacing;
      const n = (row.isTeamEvent ? field.teams : field.singles).get(row.eventId) ?? null;
      return {
        playerId: row.playerId,
        eventId: row.eventId,
        eventName: row.eventName,
        eventStart: isoDay(row.startDate),
        isTeamEvent: row.isTeamEvent,
        teamName: row.isTeamEvent ? row.teamName : null,
        faction: rules.army(row.faction, row.parsedArmy, row.detachments ?? []).faction,
        detachments: row.detachments ?? [],
        placing,
        field: placing === null ? null : n,
        hasList: row.storedListId !== null,
        score: score?.score ?? null,
        counts: score?.counts ?? false,
      };
    }),
  };
}
