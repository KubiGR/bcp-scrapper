import { fileURLToPath } from 'node:url';
import type { EventSizeRule } from '@bcp/shared';
import { pino } from 'pino';
import { vi } from 'vitest';
import { FixtureTransport } from '../bcp/fixture-transport';
import { BcpSource, type TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { FetchQueueWorker } from '../fetch-queue/worker';

export const silentLogger = pino({ level: 'silent' });

/** The sample fixtures are tiny (8 players, 2 rounds): keep everything rather than filtering by size. */
export const ALL_EVENTS: EventSizeRule = { minRounds: 0, minPlayers: 0 };

export const SAMPLE_FIXTURES_DIR = fileURLToPath(
  new URL('../../../../fixtures/bcp/sample', import.meta.url),
);

export function sampleSource(): BcpSource {
  return new BcpSource(new FixtureTransport(SAMPLE_FIXTURES_DIR));
}

/** Awaits a promise while fast-forwarding fake timers (e.g. retry backoff). Needs vi.useFakeTimers(). */
/**
 * A source forwarding every method to `inner` (bound, so a class instance works), with some
 * replaced: a test's way to make one endpoint answer differently.
 */
export function sourceWith(
  inner: TournamentSource,
  overrides: Partial<TournamentSource> = {},
): TournamentSource {
  return {
    listEvents: (range, cursor) => inner.listEvents(range, cursor),
    getEvent: (id) => inner.getEvent(id),
    getPlayers: (id, options) => inner.getPlayers(id, options),
    getTeams: (id) => inner.getTeams(id),
    getTeamMatchups: (id, round) => inner.getTeamMatchups(id, round),
    getGames: (id, round) => inner.getGames(id, round),
    getEventGames: (id, round) => inner.getEventGames(id, round),
    getList: (listId) => inner.getList(listId),
    ...overrides,
  };
}

export async function settle<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const result = await settled;
  if (result.ok) return result.value;
  throw result.error;
}

/** A worker for tests: never started, driven by tick() (or drainQueue). */
export function testFetchQueue(
  db: Db,
  source: TournamentSource = sampleSource(),
): FetchQueueWorker {
  return new FetchQueueWorker({ db, source, logger: silentLogger, intervalMs: 5000 });
}

/** Ticks until nothing is left to claim (or the worker pauses). */
export async function drainQueue(worker: FetchQueueWorker): Promise<void> {
  for (let i = 0; i < 1000; i += 1) {
    const outcome = await worker.tick();
    if (outcome === 'idle' || outcome === 'paused') return;
  }
  throw new Error('Queue did not drain in 1000 ticks');
}
