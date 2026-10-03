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
  /** The win rate allowing for sample size: the low end of its 95% range (Wilson). */
  reliableWinRate: ratio,
  /** Share of each week's players (see MetaResponse.weeks); null for a week without events. */
  trend: z.array(ratio.nullable()),
  /**
   * Win rate in the range's last 30 days minus in the 30 days before them; null unless both have
   * at least MIN_CHANGE_GAMES games.
   */
  change: z.number().min(-1).max(1).nullable(),
  /** Players who went X-1 or better. */
  x1: count,
  x1Share: ratio,
};

export const ArchetypeRowSchema = z.object({
  /** The list's detachments; null = the list isn't read (Detachment unknown). */
  detachments: z.array(z.string()).nullable(),
  ...figures,
  /** Its players' dispositions, most picked first; players without a known one aren't counted. */
  dispositions: z.array(z.object({ name: z.string(), players: count })),
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
  /** The weeks (their Mondays) each row's `trend` follows. */
  weeks: z.array(z.string()),
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
    /**
     * The change column's two spans (e.g. the latest game update and the one before); all four or
     * none. Without them, the range's last 30 days are compared with the 30 before.
     */
    recentFrom: z.iso.date().optional(),
    recentTo: z.iso.date().optional(),
    priorFrom: z.iso.date().optional(),
    priorTo: z.iso.date().optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  })
  .refine(
    (q) => {
      const spans = [q.recentFrom, q.recentTo, q.priorFrom, q.priorTo];
      if (spans.every((day) => day === undefined)) return true;
      return (
        spans.every((day) => day !== undefined) &&
        (q.recentFrom ?? '') <= (q.recentTo ?? '') &&
        (q.priorFrom ?? '') <= (q.priorTo ?? '')
      );
    },
    {
      message: 'Give both compared spans (each from on or before to), or neither',
      path: ['recentFrom'],
    },
  );
export type MetaQuery = z.infer<typeof MetaQuerySchema>;
