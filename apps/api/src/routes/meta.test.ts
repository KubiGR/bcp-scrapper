import { addDays, type MetaResponse } from '@bcp/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { players } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  const source = sampleSource();
  app = createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
    fetchQueue: testFetchQueue(db, source),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures',
        state: 'fixtures',
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
    eventRule: ALL_EVENTS,
    now: () => new Date('2026-09-28T12:00:00Z'),
  });
  await syncEvent({ db, source }, 'EVTTEAM0001');
});

describe('GET /api/meta', () => {
  it('answers with faction rows and event counts', async () => {
    const response = await app.request('/api/meta?from=2026-01-01&to=2026-12-31');
    expect(response.status).toBe(200);
    const body = (await response.json()) as MetaResponse;
    expect(body.factions.length).toBeGreaterThan(0);
    expect(body.totals.players).toBeGreaterThan(0);
    expect(body.eventsLoaded).toBe(1);
  });

  it('adds weekly trends, and the change over the last 30 days against the 30 before', async () => {
    await syncEvent({ db, source: sampleSource() }, 'EVTBRACKET01'); // 9 May
    // Enough games for a change: every sample player an Ork who played 10 (7-3 and 5-5).
    await db.update(players).set({ faction: 'Orks', wins: 5, losses: 5, draws: 0 });
    await db.update(players).set({ wins: 7, losses: 3 }).where(eq(players.eventId, 'EVTBRACKET01'));
    // Last 30 days 21 Apr–20 May hold EVTBRACKET01; the 30 before (22 Mar–20 Apr) EVTTEAM0001.
    const body = (await (
      await app.request('/api/meta?from=2026-03-01&to=2026-05-20')
    ).json()) as MetaResponse;
    // From the first event's week to the last one's.
    expect(body.weeks).toEqual(Array.from({ length: 7 }, (_, i) => addDays('2026-03-23', i * 7)));
    // 70% in the last 30 days against 50% before.
    expect(body.factions.find((f) => f.faction === 'Orks')?.change).toBeCloseTo(0.2, 6);
    // A short range still compares the two 30-day spans ending on its last day.
    const shortRange = (await (
      await app.request('/api/meta?from=2026-05-01&to=2026-05-20')
    ).json()) as MetaResponse;
    expect(shortRange.factions.find((f) => f.faction === 'Orks')?.change).toBeCloseTo(0.2, 6);
  });

  it('compares two given spans instead, such as two game updates', async () => {
    await syncEvent({ db, source: sampleSource() }, 'EVTBRACKET01'); // 9 May
    await db.update(players).set({ faction: 'Orks', wins: 5, losses: 5, draws: 0 });
    await db.update(players).set({ wins: 7, losses: 3 }).where(eq(players.id, 'PB-R1'));
    await db.update(players).set({ wins: 7, losses: 3 }).where(eq(players.eventId, 'EVTBRACKET01'));
    // Only May in range, but the change compares May (recent) with March-April (prior).
    const body = (await (
      await app.request(
        '/api/meta?from=2026-05-01&to=2026-05-20&recentFrom=2026-05-01&recentTo=2026-05-20&priorFrom=2026-03-01&priorTo=2026-04-30',
      )
    ).json()) as MetaResponse;
    expect(body.factions.find((f) => f.faction === 'Orks')?.change).toBeCloseTo(0.2, 6);
    // Spans that say nothing about the last 30 days: no change.
    const empty = (await (
      await app.request(
        '/api/meta?from=2026-05-01&to=2026-05-20&recentFrom=2026-06-01&recentTo=2026-06-30&priorFrom=2026-03-01&priorTo=2026-04-30',
      )
    ).json()) as MetaResponse;
    expect(empty.factions.find((f) => f.faction === 'Orks')?.change).toBeNull();
  });

  it('wants both compared spans or neither', async () => {
    expect((await app.request('/api/meta?recentFrom=2026-05-01&recentTo=2026-05-20')).status).toBe(
      400,
    );
  });

  it('has no team section for singles only', async () => {
    const body = (await (
      await app.request('/api/meta?from=2026-01-01&to=2026-12-31&type=singles')
    ).json()) as MetaResponse;
    expect(body.teams).toBeNull();
    expect(body.teamEventsCounted).toBe(0);
  });

  it('validates its input', async () => {
    expect((await app.request('/api/meta?type=pairs')).status).toBe(400);
    expect((await app.request('/api/meta?from=2026-05-01&to=2026-01-01')).status).toBe(400);
  });
});
