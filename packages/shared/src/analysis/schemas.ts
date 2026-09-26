import { z } from 'zod';
import { GameResultSchema, SideSchema } from '../domain';

const nullableNumber = z.number().nullable();
const round = z.number().int().positive();

/** A result from one side's point of view. A bye counts as a win in totals. */
export const OutcomeSchema = z.enum(['win', 'loss', 'draw', 'bye']);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const TeamRefSchema = z.object({ id: z.string(), name: z.string() });
export type TeamRef = z.infer<typeof TeamRefSchema>;

export const PlayerRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  faction: z.string().nullable(),
  /** True when `faction` was read from the player's list because BCP has none. */
  factionGuessed: z.boolean(),
  teamId: z.string().nullable(),
  /** The army's disposition (BCP's subFaction), e.g. "Take and Hold". */
  disposition: z.string().nullable(),
  /** From the player's fetched list; empty when not fetched or not readable. */
  detachments: z.array(z.string()),
});
export type PlayerRef = z.infer<typeof PlayerRefSchema>;

export const GameViewSchema = z.object({
  id: z.string(),
  tableNo: z.number().int().nullable(),
  playerA: PlayerRefSchema,
  /** Null for a bye. */
  playerB: PlayerRefSchema.nullable(),
  gamePointsA: nullableNumber,
  gamePointsB: nullableNumber,
  vpA: nullableNumber,
  vpB: nullableNumber,
  firstTurn: SideSchema.nullable(),
  result: GameResultSchema.nullable(),
});
export type GameView = z.infer<typeof GameViewSchema>;

export const MatchupViewSchema = z.object({
  id: z.string(),
  tableNo: z.number().int().nullable(),
  teamA: TeamRefSchema,
  /** Null for a bye. */
  teamB: TeamRefSchema.nullable(),
  pointsA: nullableNumber,
  pointsB: nullableNumber,
  /** Team A's outcome; null until both scores are in. */
  outcomeA: OutcomeSchema.nullable(),
  games: z.array(GameViewSchema),
});
export type MatchupView = z.infer<typeof MatchupViewSchema>;

export const RoundViewSchema = z.object({
  round,
  bracket: z.boolean(),
  matchups: z.array(MatchupViewSchema),
  /** Games not under a stored team matchup (singles events). */
  games: z.array(GameViewSchema),
});
export type RoundView = z.infer<typeof RoundViewSchema>;

export const RoundsResponseSchema = z.object({
  /** False when team matchups are stored but BCP served no individual games. */
  gamesAvailable: z.boolean(),
  rounds: z.array(RoundViewSchema),
});
export type RoundsResponse = z.infer<typeof RoundsResponseSchema>;

export const RoundInfoSchema = z.object({ round, bracket: z.boolean() });
export type RoundInfo = z.infer<typeof RoundInfoSchema>;

/** W/L/D (byes count as wins) and summed points: team points for teams, game points for players. */
export const TotalsSchema = z.object({
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  points: z.number(),
});
export type Totals = z.infer<typeof TotalsSchema>;

export const StandingCellSchema = z.object({
  round,
  points: nullableNumber,
  outcome: OutcomeSchema.nullable(),
  opponent: TeamRefSchema.nullable(),
});
export type StandingCell = z.infer<typeof StandingCellSchema>;

export const StandingRowSchema = z.object({
  team: TeamRefSchema,
  placing: z.number().int().nullable(),
  /** One cell per entry of `rounds`; null when the team had no matchup that round. */
  perRound: z.array(StandingCellSchema.nullable()),
  totals: TotalsSchema,
});
export type StandingRow = z.infer<typeof StandingRowSchema>;

export const StandingsResponseSchema = z.object({
  rounds: z.array(RoundInfoSchema),
  teams: z.array(StandingRowSchema),
});
export type StandingsResponse = z.infer<typeof StandingsResponseSchema>;

export const PlayerRoundSchema = z.object({
  round,
  /** Null for a bye. */
  opponent: PlayerRefSchema.nullable(),
  outcome: OutcomeSchema.nullable(),
  gamePoints: nullableNumber,
  opponentGamePoints: nullableNumber,
  vp: nullableNumber,
  opponentVp: nullableNumber,
});
export type PlayerRound = z.infer<typeof PlayerRoundSchema>;

export const TeamPlayerRowSchema = z.object({
  player: PlayerRefSchema,
  /** One cell per entry of `rounds`; null when the player had no game that round. */
  perRound: z.array(PlayerRoundSchema.nullable()),
  totals: TotalsSchema,
});
export type TeamPlayerRow = z.infer<typeof TeamPlayerRowSchema>;

export const TeamDetailResponseSchema = z.object({
  team: TeamRefSchema.extend({ placing: z.number().int().nullable() }),
  rounds: z.array(RoundInfoSchema),
  players: z.array(TeamPlayerRowSchema),
  totals: TotalsSchema,
});
export type TeamDetailResponse = z.infer<typeof TeamDetailResponseSchema>;
