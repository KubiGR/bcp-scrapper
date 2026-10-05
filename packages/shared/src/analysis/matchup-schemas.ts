import { z } from 'zod';

const count = z.number().int().nonnegative();

/** One ordered pair of factions: the row side's results against the column side. */
export const MatrixCellSchema = z.object({
  row: z.string(),
  col: z.string(),
  games: count,
  wins: count,
  draws: count,
  losses: count,
  /** (wins + ½ draws) / games; null on the diagonal (mirror matches). */
  winRate: z.number().min(0).max(1).nullable(),
  /** Mean of the row side's game points over games with points; null when none have points. */
  avgPoints: z.number().nullable(),
});
export type MatrixCell = z.infer<typeof MatrixCellSchema>;

export const FactionMatrixSchema = z.object({
  /** Factions in alphabetical order. */
  factions: z.array(z.string()),
  cells: z.array(MatrixCellSchema),
  /** Games counted (each game once, not once per side). */
  games: count,
});
export type FactionMatrix = z.infer<typeof FactionMatrixSchema>;

export const ScaleSchema = z.object({
  /** True when every included event scores its games to the same total. */
  consistent: z.boolean(),
  /** That shared total (e.g. 20), or null when inconsistent or unknown. */
  scale: z.number().nullable(),
});

export const MatchupsResponseSchema = z.object({
  matrix: FactionMatrixSchema,
  scoring: ScaleSchema,
  /** Every detachment played in the loaded games (before filtering), A→Z. */
  detachments: z.array(z.string()),
});
export type MatchupsResponse = z.infer<typeof MatchupsResponseSchema>;

/** One detachment's results against each opponent faction (cells' `row` is the faction). */
export const DetachmentRowSchema = z.object({
  detachment: z.string(),
  /** Games counted, from this row's side. */
  games: count,
  cells: z.array(MatrixCellSchema),
});
export type DetachmentRow = z.infer<typeof DetachmentRowSchema>;

/** GET …/matchups/detachments?faction=: the faction's detachment rows. */
export const DetachmentRowsResponseSchema = z.object({
  faction: z.string(),
  rows: z.array(DetachmentRowSchema),
});
export type DetachmentRowsResponse = z.infer<typeof DetachmentRowsResponseSchema>;

export const CellGameSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  eventName: z.string(),
  round: z.number().int().positive(),
  tableNo: z.number().int().nullable(),
  row: z.object({
    name: z.string(),
    faction: z.string(),
    factionGuessed: z.boolean(),
    disposition: z.string().nullable(),
    detachments: z.array(z.string()),
    teamName: z.string().nullable(),
  }),
  col: z.object({
    name: z.string(),
    faction: z.string(),
    factionGuessed: z.boolean(),
    disposition: z.string().nullable(),
    detachments: z.array(z.string()),
    teamName: z.string().nullable(),
  }),
  outcome: z.enum(['win', 'loss', 'draw']),
  rowPoints: z.number().nullable(),
  colPoints: z.number().nullable(),
});
export type CellGame = z.infer<typeof CellGameSchema>;

export const CellGamesResponseSchema = z.object({ games: z.array(CellGameSchema) });
export type CellGamesResponse = z.infer<typeof CellGamesResponseSchema>;

export const PairingsStateSchema = z.enum(['synced', 'fetching', 'partial', 'missing']);
export type PairingsState = z.infer<typeof PairingsStateSchema>;

export const MatchupEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.iso.datetime(),
  playerCount: count,
  teamCount: count.nullable(),
  roundCount: count,
  pairings: PairingsStateSchema,
  /** Counted in the combined matrix. */
  included: z.boolean(),
});
export type MatchupEvent = z.infer<typeof MatchupEventSchema>;

export const CrossEventMatchupsResponseSchema = MatchupsResponseSchema.extend({
  events: z.array(MatchupEventSchema),
});
export type CrossEventMatchupsResponse = z.infer<typeof CrossEventMatchupsResponseSchema>;

export const BulkPairingsRequestSchema = z.object({
  eventIds: z.array(z.string().min(1)).min(1).max(200),
});
export type BulkPairingsRequest = z.infer<typeof BulkPairingsRequestSchema>;

export const BulkPairingsResultSchema = z.object({
  /** Events that got at least one job queued. */
  events: count,
  queuedRounds: count,
  estimatedSeconds: count.nullable(),
});
export type BulkPairingsResult = z.infer<typeof BulkPairingsResultSchema>;
