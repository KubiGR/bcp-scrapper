import { fileURLToPath } from 'node:url';
import { pino } from 'pino';
import { FixtureTransport } from '../bcp/fixture-transport';
import { BcpSource } from '../bcp/source';

export const silentLogger = pino({ level: 'silent' });

export const SAMPLE_FIXTURES_DIR = fileURLToPath(
  new URL('../../../../fixtures/bcp/sample', import.meta.url),
);

export function sampleSource(): BcpSource {
  return new BcpSource(new FixtureTransport(SAMPLE_FIXTURES_DIR));
}
