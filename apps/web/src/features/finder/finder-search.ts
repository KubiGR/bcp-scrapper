import { addDays, LATEST_DAYS_BACK, latestWindow, toIsoDate, type DateRange } from '@bcp/shared';
import { z } from 'zod';

// Every stored event has 20+ players (the finder only shows big events), so "All" means 20+.
export const SIZE_PRESETS = [
  { value: 'all', label: 'All (20+)', minPlayers: 0 },
  { value: '40', label: '40+', minPlayers: 40 },
  { value: '100', label: '100+', minPlayers: 100 },
  { value: '200', label: '200+', minPlayers: 200 },
] as const;

/** Events per page to choose from; the first is the default. */
export const FINDER_PAGE_SIZES = [25, 50, 100] as const;
export type FinderPageSize = (typeof FINDER_PAGE_SIZES)[number];
const isPageSize = (n: number): n is FinderPageSize =>
  (FINDER_PAGE_SIZES as readonly number[]).includes(n);
const optionalCount = z.coerce.number().int().nonnegative().optional().catch(undefined);
const optionalDay = z.iso.date().optional().catch(undefined);
const optionalText = z.string().trim().min(1).optional().catch(undefined);

/** The finder's URL search params. Anything malformed falls back to its default, so a bad link still opens. */
export const FinderSearchSchema = z.object({
  size: z.enum(['all', '40', '100', '200', 'custom']).catch('40'),
  min: optionalCount,
  max: optionalCount,
  from: optionalDay,
  to: optionalDay,
  q: optionalText,
  country: optionalText,
  type: z.enum(['all', 'singles', 'teams']).catch('all'),
  sort: z.enum(['date', 'players']).catch('date'),
  /** `asc`: oldest or smallest first. */
  dir: z.enum(['asc', 'desc']).catch('desc'),
  page: z.coerce.number().int().positive().catch(1),
  per: z.coerce.number().refine(isPageSize).catch(FINDER_PAGE_SIZES[0]),
});
export type FinderSearch = z.infer<typeof FinderSearchSchema>;

/** `replace`: typing into a field updates the URL without adding a history entry per edit. */
export interface FinderChangeOptions {
  replace?: boolean;
}
export type OnFinderChange = (
  changes: Partial<FinderSearch>,
  options?: FinderChangeOptions,
) => void;

export const isLatestView = (search: Pick<FinderSearch, 'from' | 'to'>) =>
  search.from === undefined && search.to === undefined;

export function sizeBounds(search: Pick<FinderSearch, 'size' | 'min' | 'max'>): {
  minPlayers: number;
  maxPlayers?: number;
} {
  if (search.size !== 'custom') {
    const preset = SIZE_PRESETS.find((candidate) => candidate.value === search.size);
    return { minPlayers: preset?.minPlayers ?? 0 };
  }
  const minPlayers = search.min ?? 0;
  // A maximum below the minimum can only come from a hand-edited URL: ignore it rather than error.
  return search.max !== undefined && search.max >= minPlayers
    ? { minPlayers, maxPlayers: search.max }
    : { minPlayers };
}

/** The date window the finder shows: the "Latest" default, or the advanced range (open ends filled in). */
export function finderWindow(search: Pick<FinderSearch, 'from' | 'to'>, now: Date): DateRange {
  if (isLatestView(search)) return latestWindow(now);
  const to = search.to ?? toIsoDate(now);
  const from = search.from ?? addDays(to, -LATEST_DAYS_BACK);
  return from <= to ? { from, to } : { from: to, to: from };
}

/** The query string for GET /api/events. */
export function toEventsQueryString(search: FinderSearch, now: Date): string {
  const { from, to } = finderWindow(search, now);
  const { minPlayers, maxPlayers } = sizeBounds(search);
  const params = new URLSearchParams({
    from,
    to,
    minPlayers: String(minPlayers),
    type: search.type,
    sort: search.sort,
    page: String(search.page),
    pageSize: String(search.per),
  });
  if (search.dir === 'asc') params.set('dir', 'asc');
  if (maxPlayers !== undefined) params.set('maxPlayers', String(maxPlayers));
  if (search.q !== undefined) params.set('q', search.q);
  if (search.country !== undefined) params.set('country', search.country);
  return params.toString();
}
