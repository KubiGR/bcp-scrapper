import { z } from 'zod';
import { EventSummarySchema } from './domain';
import { ApiErrorCodeSchema } from './error-code';
import { MAX_LOSSES_LIMIT } from './lists';
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
  /** Players whose current BCP list is stored locally. */
  listsFetched: z.number().int().nonnegative(),
  /** Players with a BCP list that isn't stored (never fetched, or replaced on BCP since). */
  listsMissing: z.number().int().nonnegative(),
  /** Open queue requests (queued or fetching) for this event's players. */
  listsQueued: z.number().int().nonnegative(),
  /** Players whose newest list request failed and whose list isn't stored. */
  listsFailed: z.number().int().nonnegative(),
});
export type EventCounts = z.infer<typeof EventCountsSchema>;

/** The most recent run of each event-scoped kind, whatever its status. */
export const EventSyncsSchema = z.object({
  event: SyncRunSchema.nullable(),
  pairings: SyncRunSchema.nullable(),
});
export type EventSyncs = z.infer<typeof EventSyncsSchema>;

export const EventDetailSchema = EventListItemSchema.extend({
  /** True when the page should (re)load the event from BCP: never synced, or running and > 10 min old. */
  stale: z.boolean(),
  counts: EventCountsSchema,
  syncs: EventSyncsSchema,
  /** Seconds until this event's queued lists are fetched; null when none are queued. */
  listQueueSeconds: z.number().int().nonnegative().nullable(),
});
export type EventDetail = z.infer<typeof EventDetailSchema>;

export const ListStatusSchema = z.enum([
  'none',
  'available',
  'queued',
  'fetching',
  'fetched',
  'failed',
]);
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
  /** Why the newest list request failed (only when `listStatus` is failed). */
  listError: z.string().nullable(),
  /**
   * The failure's code (only when `listStatus` is failed): an ApiErrorCode, or NO_LIST when BCP
   * has no such list. NO_LIST is final: not counted as failed, not retried, not queued in bulk.
   */
  listErrorCode: z.string().nullable(),
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

/** POST /api/events/:id/lists/queue: all missing lists, those passing a loss limit, or chosen players. */
export const QueueListsRequestSchema = z
  .object({
    maxLosses: z.number().int().min(0).max(MAX_LOSSES_LIMIT).optional(),
    playerIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
  })
  .refine((request) => request.maxLosses === undefined || request.playerIds === undefined, {
    message: 'Send `maxLosses` or `playerIds`, not both',
  });
export type QueueListsRequest = z.infer<typeof QueueListsRequestSchema>;

const count = z.number().int().nonnegative();

export const QueueListsResultSchema = z.object({
  queued: count,
  alreadyQueued: count,
  alreadyFetched: count,
  noListOnBcp: count,
  /** Players with a missing list who don't pass `maxLosses`. */
  notQualifying: count,
  /** Until this request's lists are fetched, at the current pace; null when nothing is queued. */
  estimatedSeconds: count.nullable(),
});
export type QueueListsResult = z.infer<typeof QueueListsResultSchema>;

export const ListQueuePauseReasonSchema = z.enum(['user', 'login-rejected', 'rate-limited']);
export type ListQueuePauseReason = z.infer<typeof ListQueuePauseReasonSchema>;

export const ListQueueStateSchema = z.object({
  paused: z.boolean(),
  pausedReason: ListQueuePauseReasonSchema.nullable(),
  /** Set when the pause lifts by itself (after a BCP rate limit). */
  pausedUntil: z.iso.datetime().nullable(),
  intervalMs: z.number().int().positive(),
  totals: z.object({ queued: count, fetching: count, failed: count }),
  /** Until the whole queue is empty, at the current pace; null when it is empty. */
  estimatedSeconds: count.nullable(),
});
export type ListQueueState = z.infer<typeof ListQueueStateSchema>;
