import { addDays, MetaResponseSchema, toIsoDate, type DateRange } from '@bcp/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

export type MetaSort = 'faction' | 'players' | 'winRate' | 'reliable' | 'change' | 'x1' | 'overrep';

/** The Meta page's URL search. `expanded`: `|`-separated factions ("(unknown)" for none). */
export interface MetaSearch {
  from?: string;
  to?: string;
  type?: 'all' | 'singles' | 'teams';
  minPlayers?: number;
  /** The main table: `archetypes` (faction + detachments, the default) or `armies` (factions). */
  view?: 'archetypes' | 'armies';
  /** The archetype view's factions, `|`-separated ("(unknown)" for none); unset = all. */
  factions?: string;
  sort?: MetaSort;
  /** Sort direction; default high to low (A→Z for faction). */
  dir?: 'asc' | 'desc';
  expanded?: string;
}

export const DEFAULT_MIN_PLAYERS = 10;

/** The two spans Meta's Change compares (e.g. the latest game update and the one before). */
export interface ChangeSpans {
  recentFrom: string;
  recentTo: string;
  priorFrom: string;
  priorTo: string;
}

export const DEFAULT_CHANGE_LABEL =
  'Win rate in the last 30 days minus the 30 days before them, with 30+ games in each; – otherwise.';

/** Only the date range, event type and compared spans go to the API; the rest is display. */
export function metaParams(search: MetaSearch, compare?: ChangeSpans): string {
  return new URLSearchParams(
    Object.entries({ from: search.from, to: search.to, type: search.type, ...compare }).flatMap(
      ([key, value]) => (value === undefined ? [] : [[key, value]]),
    ),
  ).toString();
}

export const metaQuery = (search: MetaSearch, compare?: ChangeSpans) =>
  queryOptions({
    queryKey: ['meta', metaParams(search, compare)],
    queryFn: () => {
      const params = metaParams(search, compare);
      return apiGet(`/api/meta${params ? `?${params}` : ''}`, MetaResponseSchema);
    },
    placeholderData: keepPreviousData,
  });

/** The range shown when the URL has none: the API's default, the last 90 days. */
export function metaWindow(search: MetaSearch, now: Date): DateRange {
  const to = search.to ?? toIsoDate(now);
  return { from: search.from ?? addDays(to, -90), to };
}

/**
 * Like the matchups heatmap: below 45 % bad, above 55 % good; judged on the rounded percentage
 * shown, so two rates that read the same get the same colour.
 */
export function winRateTone(rate: number): 'good' | 'bad' | 'even' {
  const shown = Math.round(rate * 100);
  if (shown > 55) return 'good';
  if (shown < 45) return 'bad';
  return 'even';
}

export const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** A share of all players: one decimal under 10 %, so rare archetypes don't all read 0 %. */
export const sharePercent = (ratio: number) =>
  ratio < 0.1 ? `${(ratio * 100).toFixed(1)}%` : percent(ratio);

/**
 * The reliable win rate's tone, by the rounded percentage shown: good from 50 % (the win rate is
 * very likely above even), bad below 45 %.
 */
export function reliableTone(reliable: number): 'good' | 'bad' | 'even' {
  const shown = Math.round(reliable * 100);
  if (shown >= 50) return 'good';
  if (shown < 45) return 'bad';
  return 'even';
}
