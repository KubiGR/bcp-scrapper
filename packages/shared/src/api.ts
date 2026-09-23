import { z } from 'zod';
import { EventSummarySchema } from './domain';
import { ApiErrorCodeSchema } from './error-code';
import { SyncRunSchema } from './sync';

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** `date`: newest first. `players`: biggest first. */
export const EventSortSchema = z.enum(['date', 'players']);
export type EventSort = z.infer<typeof EventSortSchema>;

/** Query string for GET /api/events. Values arrive as strings, hence the coercion. */
export const EventListQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    country: z.string().trim().min(1).optional(),
    minPlayers: z.coerce.number().int().nonnegative().default(0),
    maxPlayers: z.coerce.number().int().nonnegative().optional(),
    type: z.enum(['all', 'singles', 'teams']).default('all'),
    q: z.string().trim().min(1).optional(),
    sort: EventSortSchema.default('date'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((query) => query.maxPlayers === undefined || query.maxPlayers >= query.minPlayers, {
    message: '`maxPlayers` must be at least `minPlayers`',
    path: ['maxPlayers'],
  });
export type EventListQuery = z.infer<typeof EventListQuerySchema>;

export const EventListItemSchema = EventSummarySchema.extend({
  lastSyncedAt: z.iso.datetime().nullable(),
});
export type EventListItem = z.infer<typeof EventListItemSchema>;

export const EventListResponseSchema = z.object({
  items: z.array(EventListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type EventListResponse = z.infer<typeof EventListResponseSchema>;

/**
 * `fixtures`: serving sample data, BCP is never contacted. `connected`: the login works.
 * `rejected`: BCP refused the saved refresh token. `missing`: no usable token is configured.
 */
export const BcpStatusSchema = z.object({
  source: z.enum(['bcp', 'fixtures']),
  state: z.enum(['fixtures', 'connected', 'rejected', 'missing']),
  accessTokenExpiresAt: z.iso.datetime().nullable(),
  lastRefreshAt: z.iso.datetime().nullable(),
});
export type BcpStatus = z.infer<typeof BcpStatusSchema>;

/** Inclusive range of calendar days, `YYYY-MM-DD`. */
export const DateRangeSchema = z.object({ from: z.iso.date(), to: z.iso.date() });
export type DateRange = z.infer<typeof DateRangeSchema>;

/** A date range already fetched from BCP, and when (the oldest sync, if merged). */
export const CoveredRangeSchema = DateRangeSchema.extend({ syncedAt: z.iso.datetime() });
export type CoveredRange = z.infer<typeof CoveredRangeSchema>;

export const CatalogCoverageSchema = z.object({
  ranges: z.array(CoveredRangeSchema),
  lastSyncedAt: z.iso.datetime().nullable(),
  /** Only one catalogue run can be active at a time, whatever its range. */
  activeRun: SyncRunSchema.nullable(),
});
export type CatalogCoverage = z.infer<typeof CatalogCoverageSchema>;

/** POST /api/catalog/latest: `run` is null when the latest window is still fresh. */
export const LatestRefreshSchema = z.object({
  window: DateRangeSchema,
  run: SyncRunSchema.nullable(),
});
export type LatestRefresh = z.infer<typeof LatestRefreshSchema>;

export const EventCountsSchema = z.object({
  players: z.number().int().nonnegative(),
  teams: z.number().int().nonnegative(),
  /** Players with a list on BCP. */
  listsAvailable: z.number().int().nonnegative(),
  /** Lists stored locally. */
  listsFetched: z.number().int().nonnegative(),
});
export type EventCounts = z.infer<typeof EventCountsSchema>;

/** The most recent run of each event-scoped kind, whatever its status. */
export const EventSyncsSchema = z.object({
  event: SyncRunSchema.nullable(),
  pairings: SyncRunSchema.nullable(),
  lists: SyncRunSchema.nullable(),
});
export type EventSyncs = z.infer<typeof EventSyncsSchema>;

export const EventDetailSchema = EventListItemSchema.extend({
  /** True when the page should (re)load the event from BCP: never synced, or running and > 10 min old. */
  stale: z.boolean(),
  counts: EventCountsSchema,
  syncs: EventSyncsSchema,
});
export type EventDetail = z.infer<typeof EventDetailSchema>;

export const ListStatusSchema = z.enum(['none', 'available', 'fetched']);
export type ListStatus = z.infer<typeof ListStatusSchema>;

export const EventPlayerSchema = z.object({
  bcpId: z.string().min(1),
  name: z.string(),
  teamName: z.string().nullable(),
  faction: z.string().nullable(),
  parentFaction: z.string().nullable(),
  placing: z.number().int().nullable(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  dropped: z.boolean(),
  listStatus: ListStatusSchema,
});
export type EventPlayer = z.infer<typeof EventPlayerSchema>;

export const EventPlayersResponseSchema = z.object({ items: z.array(EventPlayerSchema) });
export type EventPlayersResponse = z.infer<typeof EventPlayersResponseSchema>;

export const PlayerListSchema = z.object({
  playerId: z.string().min(1),
  playerName: z.string(),
  teamName: z.string().nullable(),
  faction: z.string().nullable(),
  listId: z.string().min(1),
  text: z.string().nullable(),
  fetchedAt: z.iso.datetime(),
});
export type PlayerList = z.infer<typeof PlayerListSchema>;

export const ListExportFormatSchema = z.enum(['txt', 'json']);
export type ListExportFormat = z.infer<typeof ListExportFormatSchema>;
