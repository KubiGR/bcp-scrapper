import { z } from 'zod';

export const EVENT_TABS = [
  { value: 'players', label: 'Players & lists' },
  { value: 'rounds', label: 'Rounds' },
  { value: 'standings', label: 'Standings' },
  { value: 'matchups', label: 'Matchups' },
] as const;
export type EventTab = (typeof EVENT_TABS)[number]['value'];

export const PLAYER_SORT_OPTIONS = [
  { value: 'placing', label: 'Placing', dir: 'asc' },
  { value: 'wins', label: 'Record', dir: 'desc' },
  { value: 'elo', label: 'Elo', dir: 'desc' },
  { value: 'name', label: 'Player', dir: 'asc' },
  { value: 'faction', label: 'Faction', dir: 'asc' },
  { value: 'oppWinRate', label: 'Opp. win %', dir: 'desc' },
  { value: 'oppElo', label: 'Opp. Elo', dir: 'desc' },
  { value: 'listStatus', label: 'List', dir: 'asc' },
] as const;

const text = z.string().min(1);
const selection = z
  .union([text, z.array(text).nonempty()])
  .optional()
  .catch(undefined);

export const PlayerSearchSchema = z.object({
  q: text.optional().catch(undefined),
  faction: selection,
  disposition: selection,
  detachment: selection,
  maxLosses: z.number().int().min(0).max(5).optional().catch(undefined),
  sort: z
    .enum(PLAYER_SORT_OPTIONS.map((option) => option.value))
    .optional()
    .catch(undefined),
});
export type PlayerSearch = z.infer<typeof PlayerSearchSchema>;

/** The event tab, open list, filters and sort order all travel with the shared URL. */
export const EventSearchSchema = PlayerSearchSchema.extend({
  tab: z.enum(EVENT_TABS.map((tab) => tab.value)).catch('players'),
  list: z.string().optional().catch(undefined),
});

export const selectedValues = (value: string | string[] | undefined): string[] =>
  typeof value === 'string' ? [value] : (value ?? []);

export const selectionParam = (values: string[]): string | string[] | undefined =>
  values.length > 1 ? values : values[0];
