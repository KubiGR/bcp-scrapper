import { z } from 'zod';
import { EVENT_TABS, type EventTab } from './EventPage';

const tabValues = EVENT_TABS.map((tab) => tab.value) as [EventTab, ...EventTab[]];

/** The event page's address: the tab, and the player whose list is open (a shareable link). */
export const EventSearchSchema = z.object({
  tab: z.enum(tabValues).catch('players'),
  list: z.string().optional().catch(undefined),
});
