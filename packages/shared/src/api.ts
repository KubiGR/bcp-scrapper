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
});
export type EventSyncs = z.infer<typeof EventSyncsSchema>;

/** What is stored and queued of an event's pairings. */
export const EventPairingsSchema = z.object({
  /** When every round last succeeded through the fetch queue; null until then. */
  syncedAt: z.iso.datetime().nullable(),
  roundCount: z.number().int().nonnegative(),
  /** Rounds with stored team matchups or games. */
  roundsDone: z.number().int().nonnegative(),
  /** Open event/pairings jobs for this event. */
  queued: z.number().int().nonnegative(),
  /** Rounds, or the event load, whose newest fetch failed. */
  failed: z.number().int().nonnegative(),
  /** False when team matchups are stored but BCP served no individual games. */
  gamesAvailable: z.boolean(),
});
export type EventPairings = z.infer<typeof EventPairingsSchema>;

export const EventDetailSchema = EventListItemSchema.extend({
  /** True when the page should (re)load the event from BCP: never synced, or running and > 10 min old. */
  stale: z.boolean(),
  counts: EventCountsSchema,
  syncs: EventSyncsSchema,
  /** Seconds until this event's queued jobs (lists and pairings) are done; null when none. */
  queueSeconds: z.number().int().nonnegative().nullable(),
  pairings: EventPairingsSchema,
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
  teamId: z.string().nullable(),
  /** The team's BCP placing, for ordering teams. */
  teamPlacing: z.number().int().nullable(),
  faction: z.string().nullable(),
  /** True when `faction` was read from the player's list because BCP has none (or only an allegiance). */
  factionGuessed: z.boolean(),
  parentFaction: z.string().nullable(),
  placing: z.number().int().nullable(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  dropped: z.boolean(),
  /** The army's disposition (BCP's subFaction), e.g. "Take and Hold". */
  disposition: z.string().nullable(),
  /** From the player's fetched list; empty when not fetched or not readable. */
  detachments: z.array(z.string()),
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
    /** Whole teams (team events): every player of these teams. */
    teamIds: z.array(z.string().min(1)).min(1).max(200).optional(),
    /** Players whose final placing is N or better (ties included). */
    topPlacings: z.number().int().min(1).max(256).optional(),
    /** Every player of the teams whose final placing is N or better. */
    topTeams: z.number().int().min(1).max(256).optional(),
  })
  .refine(
    (request) =>
      [
        request.maxLosses,
        request.playerIds,
        request.teamIds,
        request.topPlacings,
        request.topTeams,
      ].filter((value) => value !== undefined).length <= 1,
    {
      message:
        'Send at most one of `maxLosses`, `playerIds`, `teamIds`, `topPlacings` or `topTeams`',
    },
  );
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

export const QueuePairingsResultSchema = z.object({
  /** An event job was queued (or already open) because the event was never synced. */
  eventQueued: z.boolean(),
  queuedRounds: z.number().int().nonnegative(),
  estimatedSeconds: z.number().int().nonnegative().nullable(),
});
export type QueuePairingsResult = z.infer<typeof QueuePairingsResultSchema>;

export const FetchJobKindSchema = z.enum(['list', 'event', 'pairings-round']);
export type FetchJobKind = z.infer<typeof FetchJobKindSchema>;

const JobTotalsSchema = z.object({
  queued: z.number().int().nonnegative(),
  fetching: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const FetchQueuePauseReasonSchema = z.enum(['user', 'login-rejected', 'rate-limited']);
export type FetchQueuePauseReason = z.infer<typeof FetchQueuePauseReasonSchema>;

export const FetchQueueStateSchema = z.object({
  paused: z.boolean(),
  pausedReason: FetchQueuePauseReasonSchema.nullable(),
  /** Set when the pause lifts by itself (after a BCP rate limit). */
  pausedUntil: z.iso.datetime().nullable(),
  intervalMs: z.number().int().positive(),
  /** Sums over all kinds, and per kind. */
  totals: JobTotalsSchema.extend({ byKind: z.record(FetchJobKindSchema, JobTotalsSchema) }),
  /** Until the user's jobs are done, at the current pace; null when there are none. */
  estimatedSeconds: count.nullable(),
  /** Automatic fetching, counted apart from the user's jobs above. */
  auto: z.object({ enabled: z.boolean(), jobs: count, events: count }),
});
export type FetchQueueState = z.infer<typeof FetchQueueStateSchema>;

/** GET/POST /api/auto-fetch. */
export const AutoFetchStateSchema = z.object({
  enabled: z.boolean(),
  lastPlannedAt: z.iso.datetime().nullable(),
  /** Events with automatic work still open. */
  eventsPending: count,
});
export type AutoFetchState = z.infer<typeof AutoFetchStateSchema>;

export const AutoFetchRequestSchema = z.object({ enabled: z.boolean() });
export type AutoFetchRequest = z.infer<typeof AutoFetchRequestSchema>;

const commaSeparated = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

/**
 * Detachment lists in URLs are separated by `|`: a GW-app line naming several detachments that
 * couldn't be split ("A, B and C") is one name with commas in it.
 */
export const DETACHMENT_SEPARATOR = '|';

const pipeSeparated = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(DETACHMENT_SEPARATOR)
      .map((part) => part.trim())
      .filter(Boolean),
  );

/** A factions/detachments filter value matching players without one (Unknown faction etc.). */
export const UNKNOWN_FILTER = '(unknown)';

/** GET /api/players/search: players of big events who went X-n or better. */
export const PlayerSearchQuerySchema = z
  .object({
    factions: commaSeparated,
    dispositions: commaSeparated,
    detachments: pipeSeparated,
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** The page offers 0–5; up to 20 lets a drill-down include everyone with games. */
    maxLosses: z.coerce.number().int().min(0).max(MAX_LOSSES_LIMIT).default(1),
    /** `exact`: a player's detachments must be exactly the listed set (an archetype); else any. */
    detachmentsMatch: z.enum(['any', 'exact']).optional(),
    /** Event type; all when absent. */
    type: z.enum(['all', 'singles', 'teams']).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });
export type PlayerSearchQuery = z.infer<typeof PlayerSearchQuerySchema>;

export const TopListPlayerSchema = EventPlayerSchema.extend({
  eventId: z.string(),
  eventName: z.string(),
  eventStartDate: z.iso.datetime(),
});
export type TopListPlayer = z.infer<typeof TopListPlayerSchema>;

/** At most this many players are returned; `truncated` says there were more. */
export const TOP_LISTS_LIMIT = 500;

export const PlayerSearchResponseSchema = z.object({
  players: z.array(TopListPlayerSchema),
  truncated: z.boolean(),
  /** Factions of every qualifying player, before the faction/detachment filters (A→Z). */
  factionOptions: z.array(z.string()),
  /** Detachments of every qualifying player, before the faction/detachment filters (A→Z). */
  detachmentOptions: z.array(z.string()),
  /** Big events starting in the range. */
  eventsInRange: z.number().int().nonnegative(),
  /** Of those, events whose players are stored (the others aren't searched). */
  eventsLoaded: z.number().int().nonnegative(),
});
export type PlayerSearchResponse = z.infer<typeof PlayerSearchResponseSchema>;

/** Settings → Detachment names: names BCP doesn't use, the detachments to link them to, links. */
export const DetachmentNamesResponseSchema = z.object({
  unsure: z.array(
    z.object({
      name: z.string(),
      lists: z.number().int().nonnegative(),
      factions: z.array(z.string()),
    }),
  ),
  /** BCP's detachment names, with the factions they're played in. */
  targets: z.array(z.object({ name: z.string(), factions: z.array(z.string()) })),
  /** `target` null = marked as its own detachment. */
  links: z.array(z.object({ name: z.string(), target: z.string().nullable() })),
});
export type DetachmentNamesResponse = z.infer<typeof DetachmentNamesResponseSchema>;

export const DetachmentLinkRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** The detachment `name` means, or null: `name` is its own detachment. */
  target: z.string().trim().min(1).max(200).nullable(),
});
export type DetachmentLinkRequest = z.infer<typeof DetachmentLinkRequestSchema>;
