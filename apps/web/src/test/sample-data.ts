import type { EventDetail, EventListItem, EventPlayer, SyncRun } from '@bcp/shared';

export function aSyncRun(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    id: 1,
    kind: 'lists',
    eventId: 'EVT1',
    status: 'succeeded',
    total: 7,
    done: 7,
    failed: 0,
    error: null,
    errorCode: null,
    startedAt: '2026-09-23T10:00:00.000Z',
    finishedAt: '2026-09-23T10:01:00.000Z',
    range: null,
    ...overrides,
  };
}

export function anEvent(overrides: Partial<EventListItem> = {}): EventListItem {
  return {
    bcpId: 'EVT1',
    name: 'Sample Team Open',
    startDate: '2026-03-28T09:00:00.000Z',
    endDate: '2026-03-29T18:00:00.000Z',
    country: 'United States',
    city: 'Springfield',
    playerCount: 8,
    teamCount: 4,
    isTeamEvent: true,
    isOnline: false,
    roundCount: 2,
    ended: true,
    hideLists: false,
    lastSyncedAt: '2026-09-23T10:00:00.000Z',
    ...overrides,
  };
}

export function anEventDetail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    ...anEvent(),
    stale: false,
    counts: {
      players: 8,
      teams: 4,
      listsAvailable: 7,
      listsFetched: 0,
      listsMissing: 7,
      listsQueued: 0,
      listsFailed: 0,
    },
    syncs: { event: aSyncRun({ kind: 'event', total: 1, done: 1 }), pairings: null },
    listQueueSeconds: null,
    ...overrides,
  };
}

export function aPlayer(overrides: Partial<EventPlayer> = {}): EventPlayer {
  return {
    bcpId: 'PL-ADA',
    name: 'Ada Archer',
    teamName: 'Alpha Squad',
    faction: 'Space Marines',
    parentFaction: 'Space Marines',
    placing: 2,
    wins: 2,
    losses: 0,
    draws: 0,
    dropped: false,
    listStatus: 'fetched',
    listError: null,
    listErrorCode: null,
    ...overrides,
  };
}
