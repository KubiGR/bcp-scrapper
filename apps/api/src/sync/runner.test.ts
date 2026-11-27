import { BIG_EVENTS, EventListQuerySchema, latestWindow } from '@bcp/shared';
import { count } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BcpSource, type TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { events, players, teams } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { NotFoundError } from '../errors';
import { findEvent, searchEvents, setEventBlocked } from '../repo/events';
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

  it('uses the active roster to qualify events with missing counts and keeps the count after detail sync', async () => {
    const start = '2026-12-03T07:00:00Z';
    const rosterCalls: (string | undefined)[] = [];
    const source = new BcpSource({
      get({ path, query }) {
        if (path === '/v1/events') {
          const summary = { eventDate: start, numberOfRounds: 8 };
          return Promise.resolve({
            data: [
              { ...summary, id: 'large', name: 'Championship' },
              { ...summary, id: 'small', name: 'Small', totalPlayers: null },
              { ...summary, id: 'empty', name: 'Empty', totalPlayers: 0 },
              { ...summary, id: 'short', name: 'Short', numberOfRounds: 3 },
            ],
          });
        }
        if (path === '/v2/events/large') {
          return Promise.resolve({
            id: 'large',
            name: 'Championship',
            dates: { start },
            status: { numberOfRounds: 8 },
          });
        }
        if (path === '/v1/events/large/players' || path === '/v1/events/small/players') {
          rosterCalls.push(query?.placings?.toString());
          const length = path.includes('/small/') ? 19 : 42;
          const active = query?.placings
            ? []
            : Array.from({ length }, (_, id) => ({ id: `p${id}` }));
          return Promise.resolve({ active });
        }
        throw new Error(`Unexpected BCP request: ${path}`);
      },
    });
    const runner = new SyncRunner({ db, source, logger: silentLogger, eventRule: BIG_EVENTS });
    const window = latestWindow(new Date('2026-11-27T12:00:00Z'));
    const run = await runToCompletion(runner, { kind: 'catalog', ...window });
    expect(run).toMatchObject({ status: 'succeeded', done: 1 });
    expect(rosterCalls).toEqual([undefined, undefined]);
    expect(await rowCount(players)).toBe(0);

    const query = EventListQuerySchema.parse({ ...window, minPlayers: 40 });
    expect((await searchEvents(db, query, BIG_EVENTS)).items).toMatchObject([
      { bcpId: 'large', playerCount: 42 },
    ]);

    const detail = await runToCompletion(runner, { kind: 'event', eventId: 'large' });
    expect(detail).toMatchObject({ status: 'succeeded' });
    expect(await findEvent(db, 'large')).toMatchObject({ playerCount: 42 });
    expect(await rowCount(players)).toBe(42);
    expect(rosterCalls.slice(2)).toEqual(['true', undefined]);
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

  it('event: one BCP no longer has keeps its data and is marked removed, not failed', async () => {
    const source = sampleSource();
    await runToCompletion(
      new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
      { kind: 'event', eventId: EVENT },
    );
    const gone = withOverrides(source, {
      getEvent: (eventId) =>
        Promise.reject(new NotFoundError(`BCP has nothing at /v2/events/${eventId}`)),
    });
    const run = await runToCompletion(
      new SyncRunner({ db, source: gone, logger: silentLogger, eventRule: ALL_EVENTS }),
      { kind: 'event', eventId: EVENT },
    );
    expect(run).toMatchObject({ status: 'succeeded', done: 1 });
    expect(await rowCount(players)).toBe(8);
    expect((await findEvent(db, EVENT))?.removedFromBcpAt).toBeInstanceOf(Date);

    // BCP has it again: a successful sync clears the mark.
    await runToCompletion(
      new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
      { kind: 'event', eventId: EVENT },
    );
    expect((await findEvent(db, EVENT))?.removedFromBcpAt).toBeNull();
  });

  it('event: one an admin blocked is refused without asking BCP; unblocked, it syncs', async () => {
    const source = sampleSource();
    await runToCompletion(
      new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
      { kind: 'event', eventId: EVENT },
    );
    await setEventBlocked(db, EVENT, new Date());
    let asked = 0;
    const counting = withOverrides(source, {
      getEvent: (eventId) => {
        asked += 1;
        return source.getEvent(eventId);
      },
    });
    const runner = new SyncRunner({
      db,
      source: counting,
      logger: silentLogger,
      eventRule: ALL_EVENTS,
    });
    const run = await runToCompletion(runner, { kind: 'event', eventId: EVENT });
    expect(run).toMatchObject({ status: 'failed', errorCode: 'EVENT_BLOCKED' });
    expect(run?.error).toMatch(/blocked/);
    expect(asked).toBe(0);

    await setEventBlocked(db, EVENT, null);
    expect(await runToCompletion(runner, { kind: 'event', eventId: EVENT })).toMatchObject({
      status: 'succeeded',
    });
    expect(asked).toBe(1);
  });

  it('event: a 404 for an event never stored still fails', async () => {
    const gone = withOverrides(sampleSource(), {
      getEvent: (eventId) =>
        Promise.reject(new NotFoundError(`BCP has nothing at /v2/events/${eventId}`)),
    });
    const run = await runToCompletion(
      new SyncRunner({ db, source: gone, logger: silentLogger, eventRule: ALL_EVENTS }),
      { kind: 'event', eventId: EVENT },
    );
    expect(run).toMatchObject({ status: 'failed', errorCode: 'NOT_FOUND' });
    expect(await findEvent(db, EVENT)).toBeUndefined();
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
