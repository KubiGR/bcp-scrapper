import { z } from 'zod';
import { PAIRING_CHIPS } from './scale';

export const PairingChipSchema = z.enum(PAIRING_CHIPS);
const TeamRefSchema = z.object({ id: z.string(), name: z.string() });

/** GET /api/events/:id/teams/:teamId/pairings: the team and the teams it can prepare against. */
export const PairingTeamsResponseSchema = z.object({
  team: TeamRefSchema,
  opponents: z.array(TeamRefSchema),
});
export type PairingTeamsResponse = z.infer<typeof PairingTeamsResponseSchema>;

export const PairingRosterPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  faction: z.string().nullable(),
  detachments: z.array(z.string()),
  /** The list text, when fetched. */
  list: z.string().nullable(),
});
export type PairingRosterPlayer = z.infer<typeof PairingRosterPlayerSchema>;

export const PairingRatingSchema = z.object({
  playerId: z.string(),
  opponentPlayerId: z.string(),
  chip: PairingChipSchema,
});
export type PairingRating = z.infer<typeof PairingRatingSchema>;

/** GET /api/events/:id/teams/:teamId/pairings/:opponentTeamId */
export const PairingResponseSchema = z.object({
  team: TeamRefSchema,
  opponent: TeamRefSchema,
  ours: z.array(PairingRosterPlayerSchema),
  theirs: z.array(PairingRosterPlayerSchema),
  ratings: z.array(PairingRatingSchema),
  /** Why there's no analysis (e.g. a team without exactly 5 players); null when there is. */
  problem: z.string().nullable(),
});
export type PairingResponse = z.infer<typeof PairingResponseSchema>;

/** PUT …/pairings/:opponentTeamId/:playerId/:opponentPlayerId; null clears the rating. */
export const SaveRatingRequestSchema = z.object({ chip: PairingChipSchema.nullable() });
export const SaveRatingResponseSchema = z.object({
  rating: PairingRatingSchema.extend({ chip: PairingChipSchema.nullable() }),
});

/** PUT …/pairings/:opponentTeamId: several ratings at once (a pasted sheet); null clears one. */
export const SaveRatingsRequestSchema = z.object({
  ratings: z
    .array(
      z.object({
        playerId: z.string(),
        opponentPlayerId: z.string(),
        chip: PairingChipSchema.nullable(),
      }),
    )
    .min(1)
    .max(25),
});
export type SaveRatingsRequest = z.infer<typeof SaveRatingsRequestSchema>;
export const SaveRatingsResponseSchema = z.object({ saved: z.number().int() });
export type SaveRatingsResponse = z.infer<typeof SaveRatingsResponseSchema>;
