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
    /** `asc` turns the sort around: oldest or smallest first. */
    dir: z.enum(['asc', 'desc']).default('desc'),
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
  /** When BCP stopped knowing this event (it answered 404); its stored data is still shown. */
  removedFromBcpAt: z.iso.datetime().nullable(),
  /** The field's average wh40k-elo, rounded; null until at least half its players are rated. */
  fieldElo: z.number().int().nullable(),
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
  /** Of those, the rounds still to fetch (without the event load that queues them). */
  queuedRounds: z.number().int().nonnegative(),
  /** Rounds, or the event load, whose newest fetch failed. */
  failed: z.number().int().nonnegative(),
  /** The rounds whose newest fetch failed, by number. */
  failedRounds: z.array(z.number().int()),
  /** The event load (which queues the rounds) failed. */
  loadFailed: z.boolean(),
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
  /** BCP's account id, for the player's ranking; null when BCP hides the user. */
  bcpUserId: z.string().nullable(),
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
  /** How strong their opponents at this event were; absent before any of its games are stored. */
  opponents: z
    .object({
      /** The opponents' average win rate at this event (a draw is half). */
      winRate: z.number().nullable(),
      /** The rated opponents' average wh40k-elo, rounded. */
      elo: z.number().nullable(),
      rated: z.number().int(),
      games: z.number().int(),
    })
    .optional(),
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
  /** False when the server runs without automatic fetching (AUTO_FETCH_ENABLED=false). */
  available: z.boolean(),
  /** Events that started within this many days are fetched; null when unavailable. */
  days: count.nullable(),
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
    /** Only events of at least this many rounds; any big event when absent. */
    minRounds: z.coerce.number().int().min(1).max(20).optional(),
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
  /** The event's size, as the tournament list shows it. */
  eventPlayerCount: z.number().int().nonnegative(),
  eventTeamCount: z.number().int().nonnegative().nullable(),
  /** The event's field Elo, rounded, as the tournament list shows it; null until enough are rated. */
  eventFieldElo: z.number().int().nullable(),
});
export type TopListPlayer = z.infer<typeof TopListPlayerSchema>;

/** At most this many players are returned; `truncated` says there were more. */
export const TOP_LISTS_LIMIT = 500;

export const PlayerSearchResponseSchema = z.object({
  players: z.array(TopListPlayerSchema),
  truncated: z.boolean(),
  /** Factions of every qualifying player, before the faction/detachment filters (A→Z). */
  factionOptions: z.array(z.string()),
  /**
   * Detachments of the qualifying players of the chosen factions (all factions when none is
   * chosen), before the detachment filter (A→Z).
   */
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
  /**
   * Names that aren't English — detected, or `marked` by hand. Lists keep them, but Meta counts
   * their players as "detachment unknown".
   */
  foreign: z.array(
    z.object({
      name: z.string(),
      lists: z.number().int().nonnegative(),
      factions: z.array(z.string()),
      marked: z.boolean(),
    }),
  ),
  /** Names ignored as junk: lists keep them, Meta counts their players as "detachment unknown". */
  ignored: z.array(
    z.object({
      name: z.string(),
      lists: z.number().int().nonnegative(),
      factions: z.array(z.string()),
    }),
  ),
  /**
   * Translations learned from BCP's detachment field (name → the detachment it's taken to mean),
   * with the target's factions; a hand link replaces one.
   */
  learned: z.array(
    z.object({ name: z.string(), target: z.string(), factions: z.array(z.string()) }),
  ),
  /**
   * Detachments to link names to: BSData's (`bsdata`, with the factions BSData lists them for)
   * and BCP's names (with the factions they're played in).
   */
  targets: z.array(
    z.object({ name: z.string(), factions: z.array(z.string()), bsdata: z.boolean() }),
  ),
  /** `target` null = marked as its own detachment; `factions`: where the name is played. */
  links: z.array(
    z.object({ name: z.string(), target: z.string().nullable(), factions: z.array(z.string()) }),
  ),
  /** Factions BSData covers: their known detachments are BSData's. */
  bsdataFactions: z.array(z.string()),
  /** Detachments lists use for an army BSData covers but doesn't list them for. */
  wrong: z.array(
    z.object({
      faction: z.string(),
      name: z.string(),
      lists: z.number().int().nonnegative(),
      /** Factions BSData lists this detachment for. */
      bsdataFactions: z.array(z.string()),
    }),
  ),
  /** Pairs kept anyway, or `ignored`: set aside, off the to-do list but still not counted. */
  kept: z.array(z.object({ faction: z.string(), name: z.string(), ignored: z.boolean() })),
});
export type DetachmentNamesResponse = z.infer<typeof DetachmentNamesResponseSchema>;

/** GET /api/detachments/lists: a few lists that use a detachment name, newest event first. */
export const DetachmentListsResponseSchema = z.object({
  lists: z.array(
    z.object({
      playerId: z.string(),
      playerName: z.string(),
      faction: z.string().nullable(),
      eventId: z.string(),
      eventName: z.string(),
      eventStartDate: z.iso.datetime(),
      detachments: z.array(z.string()),
    }),
  ),
  /** All the lists that use it (more than shown, sometimes). */
  total: z.number().int().nonnegative(),
});
export type DetachmentListsResponse = z.infer<typeof DetachmentListsResponseSchema>;

export const DetachmentListsQuerySchema = z.object({
  name: z.string().trim().min(1).max(200),
  faction: z.string().trim().min(1).max(100).optional(),
});

export const DetachmentLinkRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    /** The detachment `name` means, or null: `name` is its own detachment. */
    target: z.string().trim().min(1).max(200).nullable(),
    /** `name` isn't English (target must be null). */
    foreign: z.boolean().default(false),
    /** `name` is junk to ignore (target must be null). */
    ignored: z.boolean().default(false),
  })
  .refine((request) => !(request.foreign || request.ignored) || request.target === null, {
    message: 'A name that isn’t English can’t link to a detachment',
    path: ['target'],
  });
export type DetachmentLinkRequest = z.infer<typeof DetachmentLinkRequestSchema>;

const QueueJobSchema = z.object({
  id: z.number().int(),
  kind: FetchJobKindSchema,
  eventId: z.string(),
  eventName: z.string(),
  playerName: z.string().nullable(),
  round: z.number().int().nullable(),
});

/** GET /api/fetch-queue/details: failures by reason, and what runs next. */
export const QueueDetailsSchema = z.object({
  failures: z.array(
    z.object({
      /** The error code ("UNKNOWN" when none was recorded). */
      code: z.string(),
      /** Retrying can't help ("no list on BCP"). */
      final: z.boolean(),
      count: z.number().int().nonnegative(),
      /** The newest failures of this kind (up to 50). */
      jobs: z.array(
        QueueJobSchema.extend({
          error: z.string().nullable(),
          attempts: z.number().int().nonnegative(),
          failedAt: z.iso.datetime().nullable(),
        }),
      ),
    }),
  ),
  /** The next jobs, in the order they run; the one being fetched first. */
  next: z.array(
    QueueJobSchema.extend({
      status: z.enum(['queued', 'fetching']),
      origin: z.enum(['user', 'auto']),
    }),
  ),
});
export type QueueDetails = z.infer<typeof QueueDetailsSchema>;

/** GET /api/rankings: a page of the ranking, filtered by name and faction. */
export const RankingsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  faction: z.string().trim().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /**
   * Points (the default), Overall (60% wh40k-elo, 40% points) or wh40k-elo's rating, best first;
   * unrated players last by wh40k-elo.
   */
  sort: z.enum(['points', 'overall', 'wh40kElo']).optional(),
});
export type RankingsQuery = z.infer<typeof RankingsQuerySchema>;

/** An Elo rating and the games it rests on. */
export const EloFigureSchema = z.object({ elo: z.number(), games: z.number().int() });
export type EloFigure = z.infer<typeof EloFigureSchema>;

const RankedResultSchema = z.object({
  eventId: z.string(),
  eventName: z.string(),
  eventStart: z.iso.date(),
  isTeamEvent: z.boolean(),
  teamName: z.string().nullable(),
  placing: z.number().int(),
  field: z.number().int(),
  score: z.number(),
  counts: z.boolean(),
  /** The field's average wh40k-elo (rounded); null when too few players are rated. */
  fieldElo: z.number().nullable(),
});

export const RankedPlayerSchema = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  name: z.string(),
  points: z.number(),
  /** Results making the points (at most 5). */
  counted: z.number().int(),
  /** All counted results of the 12 months. */
  results: z.number().int(),
  best: RankedResultSchema,
  /** Most played first, at most 2. */
  factions: z.array(z.string()),
  /** wh40k-elo's rating (all of BCP); null when it doesn't list them. */
  wh40kElo: EloFigureSchema.nullable(),
  /**
   * 0–100: 60% their wh40k-elo percentile and 40% their points percentile among ranked players;
   * their points percentile alone when unrated.
   */
  overall: z.number(),
  /** Their place by Overall among all ranked players (1 = best). */
  overallRank: z.number().int().positive(),
});
export type RankedPlayerRow = z.infer<typeof RankedPlayerSchema>;

export const RankingsResponseSchema = z.object({
  players: z.array(RankedPlayerSchema),
  /** Players matching the filters. */
  total: z.number().int().nonnegative(),
  /** All ranked players. */
  ranked: z.number().int().nonnegative(),
  /** Factions of ranked players (A→Z), for the filter. */
  factionOptions: z.array(z.string()),
});
export type RankingsResponse = z.infer<typeof RankingsResponseSchema>;

/** Top-ranked players' ranks, and every stored player's wh40k-elo, by account id, for badges. */
export const TopRanksSchema = z.object({
  ranks: z.record(z.string(), z.number().int()),
  /** Rounded wh40k-elo of the players we store who have one. */
  elo: z.record(z.string(), z.number().int()).default({}),
});
export type TopRanks = z.infer<typeof TopRanksSchema>;
/** How many top players get a rank badge. */
export const TOP_RANKS = 999;

export const PlayerHistoryEntrySchema = z.object({
  /** The player's entry in that event (for its list). */
  playerId: z.string(),
  eventId: z.string(),
  eventName: z.string(),
  eventStart: z.iso.date(),
  isTeamEvent: z.boolean(),
  teamName: z.string().nullable(),
  faction: z.string().nullable(),
  detachments: z.array(z.string()),
  /** Their placing, or their team's at a team event. */
  placing: z.number().int().nullable(),
  /** Placed entries (teams at a team event). */
  field: z.number().int().nullable(),
  hasList: z.boolean(),
  /** Null when the event doesn't count (small, running, older than 12 months, no placing). */
  score: z.number().nullable(),
  counts: z.boolean(),
  /** The field's average wh40k-elo (rounded); null when too few players are rated. */
  fieldElo: z.number().nullable(),
});
export type PlayerHistoryEntry = z.infer<typeof PlayerHistoryEntrySchema>;

export const PlayerRankingSchema = z.object({
  userId: z.string(),
  name: z.string(),
  rank: z.number().int().positive().nullable(),
  ranked: z.number().int().nonnegative(),
  points: z.number(),
  /** When the oldest counted result drops out of the 12 months (YYYY-MM-DD). */
  dropsOn: z.iso.date().nullable(),
  wh40kElo: EloFigureSchema.nullable(),
  /** Newest first. */
  history: z.array(PlayerHistoryEntrySchema),
});
export type PlayerRanking = z.infer<typeof PlayerRankingSchema>;

/** GET /api/bsdata: when BSData was last checked, its factions' detachment counts, file errors. */
export const BsdataStatusSchema = z.object({
  checkedAt: z.iso.datetime().nullable(),
  factions: z.array(z.object({ faction: z.string(), detachments: z.number().int() })),
  errors: z.array(z.object({ path: z.string(), error: z.string() })),
  /** BCP's factions BSData has no detachments for (yet): BCP's names count there. */
  uncovered: z.array(z.string()),
});
export type BsdataStatus = z.infer<typeof BsdataStatusSchema>;

/** POST / DELETE /api/detachments/keeps: keep a detachment for a faction anyway, or undo it. */
export const DetachmentKeepRequestSchema = z.object({
  faction: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  /** Set the pair aside instead of keeping it: off the to-do list, still not counted. */
  ignored: z.boolean().default(false),
});
