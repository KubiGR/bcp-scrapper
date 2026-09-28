import { BIG_EVENTS } from '@bcp/shared';
import { count } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BcpSource, TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { events, players, teams } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { findEvent } from '../repo/events';
import { getSyncRun } from '../repo/sync-runs';
import { ALL_EVENTS, sampleSource, silentLogger, sourceWith } from '../test/helpers';
import { SyncRunner } from './runner';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(() => resetDb(db));

const EVENT = 'EVTTEAM0001';

async function runToCompletion(runner: SyncRunner, request: Parameters<SyncRunner['start']>[0]) {
  const run = await runner.start(request);
  await runner.idle();
  return getSyncRun(db, run.id);
}

const rowCount = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0]?.n;

/**
 * A source that behaves exactly like `source` except for `overrides`. `BcpSource` keeps its
 * transport in a `#private` field, so an `Object.create(source)` clone throws "Cannot read
 * private member" as soon as any inherited method other than the overridden one runs. Delegating
 * every method explicitly avoids relying on prototype inheritance from a class with private state.
 */
function withOverrides(source: BcpSource, overrides: Partial<TournamentSource>): TournamentSource {
  return sourceWith(source, overrides);
}

describe('SyncRunner', () => {
  it('catalog: pages through every search page', async () => {
    const runner = new SyncRunner({
      db,
      source: sampleSource(),
      logger: silentLogger,
      eventRule: ALL_EVENTS,
    });
    const run = await runToCompletion(runner, {
      kind: 'catalog',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(run).toMatchObject({ status: 'succeeded', done: 3 });
    expect(await rowCount(events)).toBe(3);
  });

  it('catalog: stores only events big enough for the runner’s size rule', async () => {
    // Of the 3 fixture events, only EVTSINGLE01 (64 players, 5 rounds) meets BIG_EVENTS.
    const runner = new SyncRunner({
      db,
      source: sampleSource(),
      logger: silentLogger,
      eventRule: BIG_EVENTS,
    });
    const run = await runToCompletion(runner, {
      kind: 'catalog',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(run).toMatchObject({ status: 'succeeded', done: 1 });
    expect(await rowCount(events)).toBe(1);
    expect(await findEvent(db, 'EVTSINGLE01')).toBeDefined();
  });

  it('event: stores detail, teams and players', async () => {
    const runner = new SyncRunner({
      db,
      source: sampleSource(),
      logger: silentLogger,
      eventRule: ALL_EVENTS,
    });
    const run = await runToCompletion(runner, { kind: 'event', eventId: EVENT });
    expect(run).toMatchObject({ status: 'succeeded', total: 1, done: 1 });
    expect(await rowCount(teams)).toBe(4);
    expect(await rowCount(players)).toBe(8);
    expect((await findEvent(db, EVENT))?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it('re-syncs drop the players BCP no longer lists', async () => {
    const source = sampleSource();
    await runToCompletion(
      new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
      {
        kind: 'event',
        eventId: EVENT,
      },
    );

    const shrunk = withOverrides(source, {
      getPlayers: async (eventId) =>
        (await source.getPlayers(eventId)).filter((player) => player.bcpId !== 'PL-HAL'),
    });
    const runner = new SyncRunner({
      db,
      source: shrunk,
      logger: silentLogger,
      eventRule: ALL_EVENTS,
    });
    await runToCompletion(runner, { kind: 'event', eventId: EVENT });

    expect(await rowCount(players)).toBe(7);
  });

  it('records INTERNAL as the code of an unexpected failure', async () => {
    const source = sampleSource();
    const broken = withOverrides(source, {
      getEvent: () => Promise.reject(new Error('kaboom')),
    });
    const runner = new SyncRunner({
      db,
      source: broken,
      logger: silentLogger,
      eventRule: ALL_EVENTS,
    });

    const run = await runToCompletion(runner, { kind: 'event', eventId: EVENT });

    expect(run).toMatchObject({ status: 'failed', error: 'kaboom', errorCode: 'INTERNAL' });
  });

  it('catalog: fails instead of looping when BCP repeats a page cursor', async () => {
    const source = sampleSource();
    const looping = withOverrides(source, {
      listEvents: async (range) => ({
        ...(await source.listEvents(range, null)),
        nextCursor: 'page-again',
      }),
    });
    const runner = new SyncRunner({
      db,
      source: looping,
      logger: silentLogger,
      eventRule: ALL_EVENTS,
    });

    const run = await runToCompletion(runner, {
      kind: 'catalog',
      from: '2026-01-01',
      to: '2026-12-31',
    });

    expect(run).toMatchObject({
      status: 'failed',
      error: 'BCP returned a repeated page cursor for /v1/events',
      errorCode: 'BCP_UNAVAILABLE',
    });
  });

  it('returns the already-active run instead of starting a duplicate', async () => {
    const runner = new SyncRunner({
      db,
      source: sampleSource(),
      logger: silentLogger,
      eventRule: ALL_EVENTS,
    });
    const [a, b] = await Promise.all([
      runner.start({ kind: 'event', eventId: EVENT }),
      runner.start({ kind: 'event', eventId: EVENT }),
    ]);
    await runner.idle();
    expect(a.id).toBe(b.id);
  });
});
