import { z } from 'zod';

/** Settings' tabs, in the address so a link can open one ("/settings?tab=users"). */
export const SETTINGS_TABS = ['general', 'users', 'detachments'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The detachments tab's faction in the address: a faction's name, or "all". */
export const ALL_FACTIONS = 'all';

export const SettingsSearchSchema = z.object({
  tab: z.enum(SETTINGS_TABS).catch('general'),
  /** Detachments: the faction shown (absent: the one with the most names left). */
  faction: z.string().min(1).optional().catch(undefined),
  /** Detachments: where to scroll, "outside" = the detachments outside their faction. */
  focus: z.enum(['outside']).optional().catch(undefined),
});
