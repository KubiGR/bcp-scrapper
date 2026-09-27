import { z } from 'zod';

const count = z.number().int().nonnegative();
const ratio = z.number().min(0).max(1);

const figures = {
  players: count,
  /** Of all counted players in the range. */
  share: ratio,
  games: count,
  /** (wins + ½ draws) ÷ games. */
  winRate: ratio,
  /** Players who went X-1 or better. */
  x1: count,
  x1Share: ratio,
};

export const ArchetypeRowSchema = z.object({
  /** The list's detachments; null = the list isn't read (Detachment unknown). */
  detachments: z.array(z.string()).nullable(),
  ...figures,
});
export type ArchetypeRow = z.infer<typeof ArchetypeRowSchema>;

export const MetaRowSchema = z.object({
  /** Null = Unknown faction. */
  faction: z.string().nullable(),
  ...figures,
  archetypes: z.array(ArchetypeRowSchema),
});
export type MetaRow = z.infer<typeof MetaRowSchema>;

const slots = {
  topSlots: count,
  topShare: ratio,
  allSlots: count,
  allShare: ratio,
  /** topShare − allShare. */
  difference: z.number(),
};

export const TeamArchetypeRowSchema = z.object({
  detachments: z.array(z.string()).nullable(),
  ...slots,
});
export type TeamArchetypeRow = z.infer<typeof TeamArchetypeRowSchema>;

export const TeamMetaRowSchema = z.object({
  faction: z.string().nullable(),
  ...slots,
  archetypes: z.array(TeamArchetypeRowSchema),
});
export type TeamMetaRow = z.infer<typeof TeamMetaRowSchema>;

export const MetaResponseSchema = z.object({
  factions: z.array(MetaRowSchema),
  /** Null when the range has no team event with final placings. */
  teams: z.array(TeamMetaRowSchema).nullable(),
  totals: z.object({ players: count, games: count }),
  eventsInRange: count,
  eventsLoaded: count,
  teamEventsCounted: count,
});
export type MetaResponse = z.infer<typeof MetaResponseSchema>;

export const MetaQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    type: z.enum(['all', 'singles', 'teams']).default('all'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });
export type MetaQuery = z.infer<typeof MetaQuerySchema>;
