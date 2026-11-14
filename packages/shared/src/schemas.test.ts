import { describe, expect, it } from 'vitest';
import {
  EventDetailSchema,
  EventListQuerySchema,
  SyncRequestSchema,
  SyncRunSchema,
  QueueListsRequestSchema,
  FetchQueueStateSchema,
} from './index';

describe('SyncRequestSchema', () => {
  it('accepts a catalogue sync with a valid date range', () => {
    const request = { kind: 'catalog', from: '2026-01-01', to: '2026-03-31' };
    expect(SyncRequestSchema.parse(request)).toEqual(request);
  });

  it('rejects a catalogue sync whose range is reversed', () => {
    const result = SyncRequestSchema.safeParse({
      kind: 'catalog',
      from: '2026-03-31',
      to: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('requires an eventId for event-scoped syncs', () => {
    expect(SyncRequestSchema.safeParse({ kind: 'event' }).success).toBe(false);
    expect(SyncRequestSchema.safeParse({ kind: 'event', eventId: 'EVT1' }).success).toBe(true);
  });

  it('rejects the retired pairings kind', () => {
    expect(SyncRequestSchema.safeParse({ kind: 'pairings', eventId: 'E1' }).success).toBe(false);
  });

  it('rejects the retired lists kind', () => {
    expect(SyncRequestSchema.safeParse({ kind: 'lists', eventId: 'E1' }).success).toBe(false);
  });

  it('rejects unknown kinds', () => {
    expect(SyncRequestSchema.safeParse({ kind: 'everything' }).success).toBe(false);
  });
});

describe('EventListQuerySchema', () => {
  it('coerces query-string values and applies defaults', () => {
    expect(EventListQuerySchema.parse({ minPlayers: '40' })).toEqual({
      minPlayers: 40,
      type: 'all',
      sort: 'date',
      dir: 'desc',
      page: 1,
      pageSize: 50,
    });
  });

  it('accepts a player-size window and a biggest-first sort', () => {
    expect(
      EventListQuerySchema.parse({ minPlayers: '50', maxPlayers: '120', sort: 'players' }),
    ).toMatchObject({ minPlayers: 50, maxPlayers: 120, sort: 'players' });
  });

  it('rejects a size window whose maximum is below its minimum', () => {
    expect(EventListQuerySchema.safeParse({ minPlayers: '100', maxPlayers: '40' }).success).toBe(
      false,
    );
  });

  it('rejects page sizes above 100', () => {
    expect(EventListQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});

const aRun = {
  id: 1,
  kind: 'catalog',
  eventId: null,
  status: 'succeeded',
  total: null,
  done: 3,
  failed: 0,
  error: null,
  errorCode: null,
  startedAt: '2026-09-23T10:00:00.000Z',
  finishedAt: '2026-09-23T10:01:00.000Z',
  range: { from: '2026-08-24', to: '2026-09-30' },
};

describe('SyncRunSchema', () => {
  it('carries the date range of catalogue runs', () => {
    expect(SyncRunSchema.parse(aRun).range).toEqual({ from: '2026-08-24', to: '2026-09-30' });
    expect(SyncRunSchema.safeParse({ ...aRun, range: undefined }).success).toBe(false);
  });
});

describe('EventDetailSchema', () => {
  it('parses detail with counts, freshness and the latest run per kind', () => {
    const detail = {
      bcpId: 'E1',
      name: 'Open',
      startDate: '2026-03-28T09:00:00.000Z',
      endDate: null,
      country: null,
      city: null,
      playerCount: 8,
      teamCount: 4,
      isTeamEvent: true,
      isOnline: false,
      roundCount: 2,
      ended: true,
      hideLists: false,
      lastSyncedAt: null,
      removedFromBcpAt: null,
      blockedAt: null,
      fieldElo: null,
      stale: true,
      counts: {
        players: 0,
        teams: 0,
        listsAvailable: 0,
        listsFetched: 0,
        listsMissing: 0,
        listsQueued: 0,
        listsFailed: 0,
      },
      syncs: {
        event: { ...aRun, kind: 'event', eventId: 'E1', range: null },
      },
      queueSeconds: null,
      pairings: {
        syncedAt: null,
        roundCount: 2,
        roundsDone: 0,
        queued: 0,
        queuedRounds: 0,
        failed: 0,
        failedRounds: [],
        loadFailed: false,
        gamesAvailable: true,
      },
    };
    expect(EventDetailSchema.parse(detail).syncs.event?.kind).toBe('event');
  });
});

describe('QueueListsRequestSchema', () => {
  it('accepts nothing, a loss limit, or player ids, but not both', () => {
    expect(QueueListsRequestSchema.parse({})).toEqual({});
    expect(QueueListsRequestSchema.parse({ maxLosses: 1 })).toEqual({ maxLosses: 1 });
    expect(QueueListsRequestSchema.parse({ playerIds: ['P1'] })).toEqual({ playerIds: ['P1'] });
    expect(QueueListsRequestSchema.safeParse({ maxLosses: 1, playerIds: ['P1'] }).success).toBe(
      false,
    );
  });

  it('rejects loss limits outside 0–20 and empty id lists', () => {
    expect(QueueListsRequestSchema.safeParse({ maxLosses: -1 }).success).toBe(false);
    expect(QueueListsRequestSchema.safeParse({ maxLosses: 21 }).success).toBe(false);
    expect(QueueListsRequestSchema.safeParse({ maxLosses: 1.5 }).success).toBe(false);
    expect(QueueListsRequestSchema.safeParse({ playerIds: [] }).success).toBe(false);
  });
});

describe('FetchQueueStateSchema', () => {
  it('parses a paused queue', () => {
    const state = {
      paused: true,
      pausedReason: 'login-rejected',
      pausedUntil: null,
      intervalMs: 5000,
      totals: {
        queued: 3,
        fetching: 0,
        failed: 1,
        byKind: {
          list: { queued: 1, fetching: 0, failed: 1 },
          event: { queued: 0, fetching: 0, failed: 0 },
          'pairings-round': { queued: 2, fetching: 0, failed: 0 },
        },
      },
      estimatedSeconds: 15,
      auto: { enabled: true, jobs: 0, events: 0 },
    };
    expect(FetchQueueStateSchema.parse(state)).toEqual(state);
  });
});
