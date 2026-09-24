import { z } from 'zod';

/** Which side of a pairing: player/team A (BCP "player1") or B ("player2"). */
export const SideSchema = z.enum(['a', 'b']);
export type Side = z.infer<typeof SideSchema>;

export const GameResultSchema = z.enum(['a_win', 'b_win', 'draw']);
export type GameResult = z.infer<typeof GameResultSchema>;

/** A tournament as we know it, from BCP search results or event detail. */
export const EventSummarySchema = z.object({
  bcpId: z.string().min(1),
  name: z.string(),
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  playerCount: z.number().int().nonnegative(),
  /** Teams in a team event. Search results carry it too now; null for singles. */
  teamCount: z.number().int().nonnegative().nullable(),
  isTeamEvent: z.boolean(),
  isOnline: z.boolean(),
  roundCount: z.number().int().nonnegative(),
  ended: z.boolean(),
  hideLists: z.boolean(),
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

/** A team's entry in one event. `roundPoints[i]` is the team score in round i + 1. */
export const TeamSchema = z.object({
  bcpId: z.string().min(1),
  eventBcpId: z.string().min(1),
  name: z.string(),
  placing: z.number().int().nullable(),
  roundPoints: z.array(z.number()),
});
export type Team = z.infer<typeof TeamSchema>;

/** A player's entry in one event. */
export const PlayerSchema = z.object({
  bcpId: z.string().min(1),
  eventBcpId: z.string().min(1),
  teamBcpId: z.string().nullable(),
  name: z.string(),
  faction: z.string().nullable(),
  parentFaction: z.string().nullable(),
  placing: z.number().int().nullable(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  dropped: z.boolean(),
  listBcpId: z.string().nullable(),
  /** The army's disposition (BCP's subFaction), e.g. "Take and Hold". */
  disposition: z.string().nullable(),
});
export type Player = z.infer<typeof PlayerSchema>;

/** Two teams paired against each other in one round. `teamBBcpId` is null for a bye. */
export const TeamMatchupSchema = z.object({
  bcpId: z.string().min(1),
  eventBcpId: z.string().min(1),
  round: z.number().int().positive(),
  tableNo: z.number().int().nullable(),
  teamABcpId: z.string().min(1),
  teamBBcpId: z.string().nullable(),
  pointsA: z.number().nullable(),
  pointsB: z.number().nullable(),
});
export type TeamMatchup = z.infer<typeof TeamMatchupSchema>;

/** One game between two players. Scores are null until entered. `playerBBcpId` is null for a bye. */
export const GameSchema = z.object({
  bcpId: z.string().min(1),
  eventBcpId: z.string().min(1),
  round: z.number().int().positive(),
  tableNo: z.number().int().nullable(),
  teamMatchupBcpId: z.string().nullable(),
  playerABcpId: z.string().min(1),
  playerBBcpId: z.string().nullable(),
  vpA: z.number().nullable(),
  vpB: z.number().nullable(),
  primaryA: z.number().nullable(),
  primaryB: z.number().nullable(),
  secondaryA: z.number().nullable(),
  secondaryB: z.number().nullable(),
  gamePointsA: z.number().nullable(),
  gamePointsB: z.number().nullable(),
  firstTurn: SideSchema.nullable(),
  result: GameResultSchema.nullable(),
});
export type Game = z.infer<typeof GameSchema>;

export const ArmyListSchema = z.object({
  bcpId: z.string().min(1),
  text: z.string().nullable(),
});
export type ArmyList = z.infer<typeof ArmyListSchema>;
