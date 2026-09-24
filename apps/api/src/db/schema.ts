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
    faction: text('faction'),
    parentFaction: text('parent_faction'),
    placing: integer('placing'),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    draws: integer('draws').notNull(),
    dropped: boolean('dropped').notNull(),
    listId: text('list_id'),
    raw: jsonb('raw').notNull(),
    ...auditColumns,
  },
  (t) => [
    index('players_event_idx').on(t.eventId),
    index('players_event_faction_idx').on(t.eventId, t.faction),
    index('players_team_idx').on(t.teamId),
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

/** Jobs waiting to reach BCP (army lists for now), one row per request; drained slowly by the FetchQueueWorker. */
export const fetchQueue = pgTable(
  'fetch_queue',
  {
    id: serial('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** BCP list id when queued; the worker fetches exactly this list. */
    listId: text('list_id').notNull(),
    /** 0 = normal, 10 = a single list someone is waiting for. Higher is claimed first. */
    priority: integer('priority').notNull().default(0),
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
    // At most one open request per player: queueing twice is a no-op.
    uniqueIndex('fetch_queue_one_open_idx')
      .on(t.playerId)
      .where(sql`${t.status} in ('queued', 'fetching')`),
    index('fetch_queue_claim_idx').on(t.status, desc(t.priority), t.queuedAt),
    index('fetch_queue_event_idx').on(t.eventId, t.status),
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
