import { fileURLToPath } from 'node:url';
import { pino } from 'pino';
import { vi } from 'vitest';
import { FixtureTransport } from '../bcp/fixture-transport';
import { BcpSource } from '../bcp/source';

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
