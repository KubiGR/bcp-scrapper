import { fileURLToPath } from 'node:url';
import { pino } from 'pino';
import { vi } from 'vitest';
import { FixtureTransport } from '../bcp/fixture-transport';
import { BcpSource, type TournamentSource } from '../bcp/source';
import type { Db } from '../db/client';
import { ListQueueWorker } from '../list-queue/worker';

export const silentLogger = pino({ level: 'silent' });

export const SAMPLE_FIXTURES_DIR = fileURLToPath(
  new URL('../../../../fixtures/bcp/sample', import.meta.url),
);

export function sampleSource(): BcpSource {
  return new BcpSource(new FixtureTransport(SAMPLE_FIXTURES_DIR));
}

/** Awaits a promise while fast-forwarding fake timers (e.g. retry backoff). Needs vi.useFakeTimers(). */
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
export function testListQueue(db: Db, source: TournamentSource = sampleSource()): ListQueueWorker {
  return new ListQueueWorker({ db, source, logger: silentLogger, intervalMs: 5000 });
}

/** Ticks until nothing is left to claim (or the worker pauses). */
export async function drainQueue(worker: ListQueueWorker): Promise<void> {
  for (let i = 0; i < 1000; i += 1) {
    const outcome = await worker.tick();
    if (outcome === 'idle' || outcome === 'paused') return;
  }
  throw new Error('Queue did not drain in 1000 ticks');
}
