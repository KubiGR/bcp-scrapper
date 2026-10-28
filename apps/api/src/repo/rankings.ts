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
  type EloFigure,
  type TopRanks,
} from '@bcp/shared';
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyRules } from './detachment-links';
import { fieldElos } from './field-elo';
import { armyLists, events, players, teams } from '../db/schema';
import { storedCurrentList } from './lists';
import type { Wh40kEloRating } from './wh40k-elo';

/** wh40k-elo's ratings by BCP account. */
export interface EloSources {
  wh40k: Map<string, Wh40kEloRating>;
}
const NO_ELO: EloSources = { wh40k: new Map() };

const figure = (rating: { elo: number; games: number } | undefined): EloFigure | null =>
  rating === undefined ? null : { elo: Math.round(rating.elo), games: rating.games };
const eloOf = (sources: EloSources, userId: string) => ({
  wh40kElo: figure(sources.wh40k.get(userId)),
});

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

const roundedElo = (elo: number | null | undefined) =>
  elo === null || elo === undefined ? null : Math.round(elo);

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
  const [rows, field, strength] = await Promise.all([
    db
      .select(resultColumns)
      .from(players)
      .leftJoin(teams, eq(teams.id, players.teamId))
      .leftJoin(armyLists, storedCurrentList)
      .where(and(inArray(players.eventId, ids), isNotNull(players.bcpUserId))),
    fields(db, ids),
    fieldElos(db, ids),
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
        fieldElo: strength.get(event.id) ?? null,
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
    fieldElo: roundedElo(best.fieldElo),
  },
});

/** Overall's weight on the wh40k-elo percentile; the rest is the points percentile. */
export const OVERALL_ELO_WEIGHT = 0.6;

/** 100 for the first of `n`, 0 for the last, evenly between; 100 when alone. */
const percentile = (index: number, n: number) => (n <= 1 ? 100 : (100 * (n - 1 - index)) / (n - 1));

/**
 * Each ranked player's Overall (0–100): 60% their wh40k-elo percentile among the rated ranked
 * players, 40% their points percentile among all ranked; the points percentile alone when unrated.
 */
function overallScores(ranked: RankedPlayer[], sources: EloSources): Map<string, number> {
  const rated = ranked
    .flatMap((player) => {
      const rating = sources.wh40k.get(player.userId);
      return rating === undefined ? [] : [{ userId: player.userId, elo: rating.elo }];
    })
    .sort((a, b) => b.elo - a.elo);
  // Tied ratings share the better place.
  const eloPercentile = new Map<string, number>();
  let place = 0;
  rated.forEach((entry, index) => {
    if (index > 0 && entry.elo !== rated[index - 1]?.elo) place = index;
    eloPercentile.set(entry.userId, percentile(place, rated.length));
  });
  return new Map(
    ranked.map((player, index) => {
      const points = percentile(index, ranked.length);
      const elo = eloPercentile.get(player.userId);
      return [
        player.userId,
        elo === undefined ? points : OVERALL_ELO_WEIGHT * elo + (1 - OVERALL_ELO_WEIGHT) * points,
      ];
    }),
  );
}

/**
 * A page of the ranking, filtered by name (plain, case-insensitive) and faction, with wh40k-elo's
 * ratings; sorted by points (rank) or by that rating, unrated players last.
 */
export function rankingsPage(
  ranked: RankedPlayer[],
  query: RankingsQuery,
  sources: EloSources = NO_ELO,
): RankingsResponse {
  const search = query.search?.toLowerCase() ?? '';
  const matching = ranked.filter(
    (player) =>
      (search === '' || player.name.toLowerCase().includes(search)) &&
      (query.faction === undefined ||
        player.scores.some((score) => score.faction === query.faction)),
  );
  const overall = overallScores(ranked, sources);
  // Places by Overall among all ranked; ties go to the better points rank.
  const overallRank = new Map(
    ranked
      .map((player) => ({
        userId: player.userId,
        score: overall.get(player.userId) ?? 0,
        rank: player.rank,
      }))
      .sort((a, b) => b.score - a.score || a.rank - b.rank)
      .map((entry, index) => [entry.userId, index + 1]),
  );
  const rows = matching.map((player) => ({
    ...withoutScores(player),
    ...eloOf(sources, player.userId),
    overall: overall.get(player.userId) ?? 0,
    overallRank: overallRank.get(player.userId) ?? ranked.length,
  }));
  const sort = query.sort ?? 'points';
  if (sort !== 'points') {
    const value = (row: (typeof rows)[number]) =>
      sort === 'overall' ? -row.overallRank : (row.wh40kElo?.elo ?? -Infinity);
    rows.sort((a, b) => value(b) - value(a) || a.rank - b.rank);
  }
  return {
    players: rows.slice(query.offset, query.offset + query.limit),
    total: matching.length,
    ranked: ranked.length,
    factionOptions: [
      ...new Set(ranked.flatMap((p) => p.scores.flatMap((s) => (s.faction ? [s.faction] : [])))),
    ].sort((a, b) => a.localeCompare(b)),
  };
}

export function topRanks(ranked: RankedPlayer[]): Pick<TopRanks, 'ranks'> {
  return {
    ranks: Object.fromEntries(ranked.slice(0, TOP_RANKS).map((p) => [p.userId, p.rank])),
  };
}

/** A player's rank and every event they played, counted or not; null for an unknown account. */
export async function playerRanking(
  db: Db,
  ranked: RankedPlayer[],
  userId: string,
  sources: EloSources = NO_ELO,
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
  const eventIds = [...new Set(rows.map((row) => row.eventId))];
  const [field, strength] = await Promise.all([fields(db, eventIds), fieldElos(db, eventIds)]);
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
    ...eloOf(sources, userId),
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
        fieldElo: roundedElo(strength.get(row.eventId)),
      };
    }),
  };
}
