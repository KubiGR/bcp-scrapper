import { z } from 'zod';

/** Settings' tabs, in the address so a link can open one ("/settings?tab=users"). */
export const SETTINGS_TABS = ['general', 'users', 'detachments'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const SettingsSearchSchema = z.object({
  tab: z.enum(SETTINGS_TABS).catch('general'),
});
