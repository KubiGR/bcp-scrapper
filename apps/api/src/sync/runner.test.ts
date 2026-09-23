import { count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BcpSource, TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { armyLists, events, games, players, teamMatchups, teams } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { BcpAuthError, BcpRateLimitedError, BcpUnavailableError } from '../errors';
import { findEvent } from '../repo/events';
import { getSyncRun } from '../repo/sync-runs';
import { sampleSource, silentLogger } from '../test/helpers';
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
  return {
    listEvents: (range, cursor) => source.listEvents(range, cursor),
    getEvent: (eventId) => source.getEvent(eventId),
    getPlayers: (eventId) => source.getPlayers(eventId),
    getTeams: (eventId) => source.getTeams(eventId),
    getTeamMatchups: (eventId, round) => source.getTeamMatchups(eventId, round),
    getGames: (eventId, round) => source.getGames(eventId, round),
    getList: (listId) => source.getList(listId),
    ...overrides,
  };
}

describe('SyncRunner', () => {
  it('catalog: pages through every search page', async () => {
    const runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
    const run = await runToCompletion(runner, {
      kind: 'catalog',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(run).toMatchObject({ status: 'succeeded', done: 3 });
    expect(await rowCount(events)).toBe(3);
  });

  it('event: stores detail, teams and players', async () => {
    const runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
    const run = await runToCompletion(runner, { kind: 'event', eventId: EVENT });
    expect(run).toMatchObject({ status: 'succeeded', total: 1, done: 1 });
    expect(await rowCount(teams)).toBe(4);
    expect(await rowCount(players)).toBe(8);
    expect((await findEvent(db, EVENT))?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it('pairings: syncs the event first when needed, then every round', async () => {
    const runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
    const run = await runToCompletion(runner, { kind: 'pairings', eventId: EVENT });
    expect(run).toMatchObject({ status: 'succeeded', total: 2, done: 2 });
    expect(await rowCount(players)).toBe(8);
    expect(await rowCount(teamMatchups)).toBe(4);
    expect(await rowCount(games)).toBe(8);
    const [draw] = await db.select().from(games).where(eq(games.id, 'GM-R2-4'));
    expect(draw).toMatchObject({ result: 'draw', firstTurn: 'b', teamMatchupId: 'TP-R2-2' });
  });

  it('re-syncs drop the games and players BCP no longer lists', async () => {
    const source = sampleSource();
    await runToCompletion(new SyncRunner({ db, source, logger: silentLogger }), {
      kind: 'pairings',
      eventId: EVENT,
    });

    const shrunk = withOverrides(source, {
      getPlayers: async (eventId) =>
        (await source.getPlayers(eventId)).filter((player) => player.bcpId !== 'PL-HAL'),
      getGames: async (eventId, round) =>
        (await source.getGames(eventId, round)).filter((game) => game.bcpId !== 'GM-R1-4'),
    });
    const runner = new SyncRunner({ db, source: shrunk, logger: silentLogger });
    await runToCompletion(runner, { kind: 'event', eventId: EVENT });
    await runToCompletion(runner, { kind: 'pairings', eventId: EVENT });

    expect(await rowCount(players)).toBe(7);
    expect(await rowCount(games)).toBe(7);
    expect(await rowCount(teamMatchups)).toBe(4);
  });

  it('lists: fetches every missing list and counts failures without failing the run', async () => {
    const source = sampleSource();
    const flaky = withOverrides(source, {
      getList: (listId) =>
        listId === 'LS-GIA'
          ? Promise.reject(new BcpUnavailableError('BCP hiccup'))
          : source.getList(listId),
    });
    const runner = new SyncRunner({ db, source: flaky, logger: silentLogger });

    const run = await runToCompletion(runner, { kind: 'lists', eventId: EVENT });

    expect(run).toMatchObject({ status: 'succeeded', total: 7, done: 6, failed: 1 });
    expect(await rowCount(armyLists)).toBe(6);
  });

  it('lists: aborts the whole run when the BCP login is broken', async () => {
    const source = sampleSource();
    const loggedOut = withOverrides(source, {
      getList: () => Promise.reject(new BcpAuthError('Session expired')),
    });
    const runner = new SyncRunner({ db, source: loggedOut, logger: silentLogger });

    const run = await runToCompletion(runner, { kind: 'lists', eventId: EVENT });

    expect(run).toMatchObject({ status: 'failed', error: 'Session expired', done: 0 });
  });

  it('lists: aborts the whole run when BCP rate limits us', async () => {
    const source = sampleSource();
    const limited = withOverrides(source, {
      getList: () => Promise.reject(new BcpRateLimitedError(60)),
    });
    const runner = new SyncRunner({ db, source: limited, logger: silentLogger });

    const run = await runToCompletion(runner, { kind: 'lists', eventId: EVENT });

    expect(run).toMatchObject({ status: 'failed', done: 0, failed: 0 });
    expect(run?.error).toMatch(/rate limiting/);
  });

  it('catalog: fails instead of looping when BCP repeats a page cursor', async () => {
    const source = sampleSource();
    const looping = withOverrides(source, {
      listEvents: async (range) => ({
        ...(await source.listEvents(range, null)),
        nextCursor: 'page-again',
      }),
    });
    const runner = new SyncRunner({ db, source: looping, logger: silentLogger });

    const run = await runToCompletion(runner, {
      kind: 'catalog',
      from: '2026-01-01',
      to: '2026-12-31',
    });

    expect(run).toMatchObject({
      status: 'failed',
      error: 'BCP returned a repeated page cursor for /v1/events',
    });
  });

  it('pairings: warns when a team round has matchups but no individual games', async () => {
    const source = sampleSource();
    const noGames = withOverrides(source, {
      getGames: (eventId, round) =>
        round === 2 ? Promise.resolve([]) : source.getGames(eventId, round),
    });
    const messages: string[] = [];
    const logger = pino(
      { level: 'warn' },
      { write: (line: string) => messages.push((JSON.parse(line) as { msg: string }).msg) },
    );
    const runner = new SyncRunner({ db, source: noGames, logger });

    const run = await runToCompletion(runner, { kind: 'pairings', eventId: EVENT });

    expect(run).toMatchObject({ status: 'succeeded' });
    expect(messages).toEqual([
      'BCP returned no individual games for round 2; team matchups stored only',
    ]);
  });

  it('returns the already-active run instead of starting a duplicate', async () => {
    const runner = new SyncRunner({ db, source: sampleSource(), logger: silentLogger });
    const [a, b] = await Promise.all([
      runner.start({ kind: 'event', eventId: EVENT }),
      runner.start({ kind: 'event', eventId: EVENT }),
    ]);
    await runner.idle();
    expect(a.id).toBe(b.id);
  });
});
