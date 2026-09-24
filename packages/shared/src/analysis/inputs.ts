import type { GameResult, Side } from '../domain';

/** Rows the analysis functions work on: what the database stores, keyed by BCP ids. */
export interface TeamRow {
  id: string;
  name: string;
  placing: number | null;
}

export interface PlayerRow {
  id: string;
  name: string;
  faction: string | null;
  teamId: string | null;
  /** The army's disposition (BCP's subFaction), e.g. "Take and Hold". */
  disposition: string | null;
}

/** `teamBId` is null for a bye. */
export interface MatchupRow {
  id: string;
  round: number;
  tableNo: number | null;
  teamAId: string;
  teamBId: string | null;
  pointsA: number | null;
  pointsB: number | null;
}

/** `playerBId` is null for a bye. VP is null when BCP didn't serve it (bracket events). */
export interface GameRow {
  id: string;
  round: number;
  tableNo: number | null;
  teamMatchupId: string | null;
  playerAId: string;
  playerBId: string | null;
  gamePointsA: number | null;
  gamePointsB: number | null;
  vpA: number | null;
  vpB: number | null;
  firstTurn: Side | null;
  result: GameResult | null;
}

export interface EventAnalysisInput {
  teams: TeamRow[];
  players: PlayerRow[];
  matchups: MatchupRow[];
  games: GameRow[];
}
