import type { ApiErrorCode } from '@bcp/shared';
import { desc, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

const auditColumns = {
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const syncKind = pgEnum('sync_kind', ['catalog', 'event', 'pairings', 'lists']);
export const syncStatus = pgEnum('sync_status', ['queued', 'running', 'succeeded', 'failed']);
export const gameResult = pgEnum('game_result', ['a_win', 'b_win', 'draw']);
export const side = pgEnum('side', ['a', 'b']);

/** Primary keys are BCP ids throughout. */
export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    startDate: timestamptz('start_date').notNull(),
    endDate: timestamptz('end_date'),
    country: text('country'),
    city: text('city'),
    playerCount: integer('player_count').notNull(),
    /** Only event detail knows this; null for singles and for events only seen in the catalogue. */
    teamCount: integer('team_count'),
    isTeamEvent: boolean('is_team_event').notNull(),
    isOnline: boolean('is_online').notNull(),
    roundCount: integer('round_count').notNull(),
    ended: boolean('ended').notNull(),
    hideLists: boolean('hide_lists').notNull(),
    /** When event detail, teams and players were last fetched. Null = only seen in the catalogue. */
    lastSyncedAt: timestamptz('last_synced_at'),
    /** Set when every round's pairings were fetched by the fetch queue. */
    pairingsSyncedAt: timestamptz('pairings_synced_at'),
    rawSummary: jsonb('raw_summary'),
    rawDetail: jsonb('raw_detail'),
    ...auditColumns,
  },
  (t) => [
    index('events_start_date_idx').on(t.startDate),
    index('events_player_count_idx').on(t.playerCount),
  ],
);

export const teams = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    placing: integer('placing'),
    roundPoints: jsonb('round_points').$type<number[]>().notNull(),
    raw: jsonb('raw').notNull(),
    ...auditColumns,
  },
  (t) => [index('teams_event_idx').on(t.eventId)],
);

export const players = pgTable(
  'players',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** No FK: BCP may reference a team entry we never received. */
    teamId: text('team_id'),
    name: text('name').notNull(),
    /** BCP's account id: the same person across events; null when BCP hides the user. */
    bcpUserId: text('bcp_user_id'),
    faction: text('faction'),
    parentFaction: text('parent_faction'),
    placing: integer('placing'),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    draws: integer('draws').notNull(),
    dropped: boolean('dropped').notNull(),
    listId: text('list_id'),
    disposition: text('disposition'),
    raw: jsonb('raw').notNull(),
    ...auditColumns,
  },
  (t) => [
    index('players_event_idx').on(t.eventId),
    index('players_event_faction_idx').on(t.eventId, t.faction),
    index('players_team_idx').on(t.teamId),
    index('players_user_idx').on(t.bcpUserId),
  ],
);

export const armyLists = pgTable('army_lists', {
  playerId: text('player_id')
    .primaryKey()
    .references(() => players.id, { onDelete: 'cascade' }),
  listId: text('list_id').notNull(),
  text: text('text'),
  raw: jsonb('raw').notNull(),
  fetchedAt: timestamptz('fetched_at').notNull().defaultNow(),
  /** Read from `text` by parseArmyList (see parser_version). */
  parsedArmy: text('parsed_army'),
  detachments: text('detachments')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  parsedDisposition: text('parsed_disposition'),
  /** The PARSER_VERSION that produced the parsed columns; older rows are re-read on startup. */
  parserVersion: integer('parser_version').notNull().default(0),
});

export const teamMatchups = pgTable(
  'team_matchups',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    tableNo: integer('table_no'),
    teamAId: text('team_a_id').notNull(),
    teamBId: text('team_b_id'),
    pointsA: real('points_a'),
    pointsB: real('points_b'),
    raw: jsonb('raw').notNull(),
    ...auditColumns,
  },
  (t) => [index('team_matchups_event_round_idx').on(t.eventId, t.round)],
);

export const games = pgTable(
  'games',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    tableNo: integer('table_no'),
    teamMatchupId: text('team_matchup_id'),
    playerAId: text('player_a_id').notNull(),
    playerBId: text('player_b_id'),
    vpA: real('vp_a'),
    vpB: real('vp_b'),
    primaryA: real('primary_a'),
    primaryB: real('primary_b'),
    secondaryA: real('secondary_a'),
    secondaryB: real('secondary_b'),
    gamePointsA: real('game_points_a'),
    gamePointsB: real('game_points_b'),
    firstTurn: side('first_turn'),
    result: gameResult('result'),
    raw: jsonb('raw').notNull(),
    ...auditColumns,
  },
  (t) => [
    index('games_event_round_idx').on(t.eventId, t.round),
    index('games_team_matchup_idx').on(t.teamMatchupId),
  ],
);

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: serial('id').primaryKey(),
    kind: syncKind('kind').notNull(),
    eventId: text('event_id'),
    params: jsonb('params').notNull(),
    status: syncStatus('status').notNull(),
    total: integer('total'),
    done: integer('done').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    error: text('error'),
    /** The AppError code of a failed run (else INTERNAL). */
    errorCode: text('error_code').$type<ApiErrorCode>(),
    startedAt: timestamptz('started_at').notNull().defaultNow(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    // At most one active run per kind and target; a second request gets the existing run.
    uniqueIndex('sync_runs_one_active_idx')
      .on(t.kind, sql`coalesce(${t.eventId}, '')`)
      .where(sql`${t.status} in ('queued', 'running')`),
    index('sync_runs_event_idx').on(t.eventId),
  ],
);

export const fetchQueueStatus = pgEnum('fetch_queue_status', [
  'queued',
  'fetching',
  'done',
  'failed',
]);

export const fetchJobKind = pgEnum('fetch_job_kind', ['list', 'event', 'pairings-round']);

/** Jobs waiting to reach BCP (army lists, events, pairing rounds), one row per request; drained slowly by the FetchQueueWorker. */
export const fetchQueue = pgTable(
  'fetch_queue',
  {
    id: serial('id').primaryKey(),
    kind: fetchJobKind('kind').notNull().default('list'),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** Only list jobs have a player and list. */
    playerId: text('player_id').references(() => players.id, { onDelete: 'cascade' }),
    /** BCP list id when queued; the worker fetches exactly this list. */
    listId: text('list_id'),
    /** Only pairings-round jobs have a round. */
    round: integer('round'),
    /** 'pairings' on an event job queued so pairings can follow: it queues the rounds when done. */
    followUp: text('follow_up'),
    /** 0 = normal, 10 = work someone is waiting for, -10 = automatic. Higher is claimed first. */
    priority: integer('priority').notNull().default(0),
    /** 'user' (asked for) or 'auto' (the automatic planner); switching auto-fetch off drops queued auto jobs. */
    origin: text('origin').$type<'user' | 'auto'>().notNull().default('user'),
    status: fetchQueueStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    /** Not claimed before this time (backoff after a transient failure). */
    notBefore: timestamptz('not_before').notNull().defaultNow(),
    error: text('error'),
    /** An ApiErrorCode, or NO_LIST when BCP has no such list. */
    errorCode: text('error_code'),
    queuedAt: timestamptz('queued_at').notNull().defaultNow(),
    finishedAt: timestamptz('finished_at'),
  },
  (t) => [
    // At most one open job per target: queueing twice is a no-op.
    uniqueIndex('fetch_queue_one_open_idx')
      .on(t.playerId)
      .where(sql`${t.kind} = 'list' and ${t.status} in ('queued', 'fetching')`),
    uniqueIndex('fetch_queue_one_open_event_idx')
      .on(t.eventId)
      .where(sql`${t.kind} = 'event' and ${t.status} in ('queued', 'fetching')`),
    uniqueIndex('fetch_queue_one_open_round_idx')
      .on(t.eventId, t.round)
      .where(sql`${t.kind} = 'pairings-round' and ${t.status} in ('queued', 'fetching')`),
    index('fetch_queue_claim_idx').on(t.status, desc(t.priority), t.queuedAt),
    index('fetch_queue_event_idx').on(t.eventId, t.status),
    check(
      'fetch_queue_list_target',
      sql`${t.kind} <> 'list' or (${t.playerId} is not null and ${t.listId} is not null)`,
    ),
    check('fetch_queue_round_target', sql`${t.kind} <> 'pairings-round' or ${t.round} is not null`),
  ],
);

/** Single-row table holding the BCP login, so rotated refresh tokens survive restarts. */
export const bcpSession = pgTable(
  'bcp_session',
  {
    id: integer('id').primaryKey().default(1),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamptz('access_token_expires_at'),
    lastRefreshAt: timestamptz('last_refresh_at'),
    seedTokenHash: text('seed_token_hash'),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('bcp_session_singleton', sql`${t.id} = 1`)],
);

export const userRole = pgEnum('user_role', ['admin', 'member']);

/** People who can log in when AUTH_REQUIRED is on. */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: text('username').notNull(),
    /** scrypt$N$r$p$salt$hash (base64); never returned or logged. */
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull().default('member'),
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    disabled: boolean('disabled').notNull().default(false),
    ...auditColumns,
  },
  (t) => [uniqueIndex('users_username_lower_unique').on(sql`lower(${t.username})`)],
);

/** Logged-in sessions; only the keyed SHA-256 of the cookie value is stored. */
export const sessions = pgTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull(),
    lastSeenAt: timestamptz('last_seen_at').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

/** App-wide settings changed at run time (e.g. automatic fetching on/off), one row per key. */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Detachment names an admin has linked by hand: `target` is the English detachment the name
 * means, or null when the name is its own (correct) detachment. They win over learned
 * translations.
 */
export const detachmentLinks = pgTable('detachment_links', {
  /** Lower-case name, as lists write it (after cleaning). */
  nameKey: text('name_key').primaryKey(),
  name: text('name').notNull(),
  target: text('target'),
  /** Marked as not English (target null): left as it is, but out of Meta's detachment rows. */
  foreign: boolean('foreign').notNull().default(false),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});
