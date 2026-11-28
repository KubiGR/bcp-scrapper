import { z } from 'zod';

/** Settings' tabs, in the address so a link can open one ("/settings?tab=users"). */
export const SETTINGS_TABS = ['general', 'users', 'detachments'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** The detachments tab's faction in the address: a faction's name, or "all". */
export const ALL_FACTIONS = 'all';
export const DETACHMENT_SECTIONS = ['names', 'outside'] as const;
export type DetachmentSection = (typeof DETACHMENT_SECTIONS)[number];

export const SettingsSearchSchema = z.object({
  tab: z.enum(SETTINGS_TABS).catch('general'),
  /** Detachments: the faction shown (absent: the one with the most names left). */
  faction: z.string().min(1).optional().catch(undefined),
  section: z.enum(DETACHMENT_SECTIONS).optional().catch(undefined),
  /** Older links open the same section via `focus`. */
  focus: z.enum(['outside']).optional().catch(undefined),
});
