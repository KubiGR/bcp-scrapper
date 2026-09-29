import { addDays } from '../catalog';

/** One counted result: a ranked player's placing at a counted event (spec §2). */
export interface RankingResult {
  userId: string;
  name: string;
  eventId: string;
  eventName: string;
  /** The event's first day (YYYY-MM-DD). */
  eventStart: string;
  isTeamEvent: boolean;
  teamName: string | null;
  /** The player's placing, or their team's at a team event. */
  placing: number;
  /** Placed entries: players, or teams at a team event. */
  field: number;
  /** The event's players (all team members at a team event). */
  players: number;
  faction: string | null;
}

export interface ScoredResult extends RankingResult {
  score: number;
  /** One of the player's RANKING_BEST best results, which make their points. */
  counts: boolean;
}

export interface RankedPlayer {
  rank: number;
  userId: string;
  name: string;
  points: number;
  /** Results making the points (at most RANKING_BEST). */
  counted: number;
  /** All counted results in the 12 months. */
  results: number;
  best: ScoredResult;
  /** Most played first, at most 2. */
  factions: string[];
  /** Newest first. */
  scores: ScoredResult[];
}

export const RANKING_BEST = 5;
export const RANKING_DAYS = 365;

/** 1 for first, 0 for last, evenly between; 1 when alone. */
export function placingScore(placing: number, field: number): number {
  if (field <= 1) return 1;
  return Math.min(1, Math.max(0, (field - placing) / (field - 1)));
}

/**
 * Bigger events count more, by the square root of their size: 1 at 100 players, 0.45 at 20, 2 at
 * 400, 3.16 at 1,000.
 */
export function sizeFactor(players: number): number {
  if (players <= 0) return 0;
  return Math.sqrt(players / 100);
}

export function eventScore(result: Pick<RankingResult, 'placing' | 'field' | 'players'>): number {
  return 100 * placingScore(result.placing, result.field) * sizeFactor(result.players);
}

/** Results must start after this day (YYYY-MM-DD) to count. */
export function rankingCutoff(today: Date): string {
  return addDays(today.toISOString().slice(0, 10), -RANKING_DAYS);
}

/** Players by points: the sum of their RANKING_BEST best event scores of the last 12 months. */
export function computeRankings(results: RankingResult[], today: Date): RankedPlayer[] {
  const cutoff = rankingCutoff(today);
  const byPlayer = new Map<string, RankingResult[]>();
  for (const result of results) {
    if (result.eventStart <= cutoff) continue;
    byPlayer.set(result.userId, [...(byPlayer.get(result.userId) ?? []), result]);
  }
  const players = [...byPlayer.values()].map((own) => {
    const byScore = own
      .map((result) => ({ result, score: eventScore(result) }))
      .sort((a, b) => b.score - a.score || b.result.eventStart.localeCompare(a.result.eventStart));
    const counting = new Set(byScore.slice(0, RANKING_BEST).map((entry) => entry.result));
    const scores: ScoredResult[] = byScore
      .map(({ result, score }) => ({ ...result, score, counts: counting.has(result) }))
      .sort((a, b) => b.eventStart.localeCompare(a.eventStart) || b.score - a.score);
    const factionCounts = new Map<string, number>();
    for (const result of own) {
      if (result.faction !== null) {
        factionCounts.set(result.faction, (factionCounts.get(result.faction) ?? 0) + 1);
      }
    }
    const best = scores.reduce((top, s) => (s.score > top.score ? s : top));
    return {
      userId: best.userId,
      name: scores[0]?.name ?? best.name,
      points: scores.filter((s) => s.counts).reduce((sum, s) => sum + s.score, 0),
      counted: counting.size,
      results: own.length,
      best,
      factions: [...factionCounts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 2)
        .map(([faction]) => faction),
      scores,
    };
  });
  return players
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.results - a.results ||
        b.best.score - a.best.score ||
        a.name.localeCompare(b.name),
    )
    .map((player, index) => ({ rank: index + 1, ...player }));
}
