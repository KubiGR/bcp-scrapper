/**
 * Records one real BCP event as anonymised fixtures, going through the real BcpSource,
 * so a successful run also proves our schemas match live BCP data.
 *
 * Uses the Postgres session store (not the in-memory one) because BCP may rotate the
 * refresh token on use; a memory store would burn the `.env` token and lose the new one.
 * Run `pnpm db:up` first.
 *
 *   pnpm --filter @bcp/api record-fixtures <eventId> [--lists 10] [--out ../../fixtures/bcp/recorded]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Anonymiser } from '../src/bcp/anonymise';
import { BcpAuth } from '../src/bcp/auth';
import { createDbSessionStore } from '../src/bcp/auth-store';
import { fixtureFileFor } from '../src/bcp/fixture-transport';
import { HttpTransport } from '../src/bcp/http-transport';
import { RateLimiter } from '../src/bcp/rate-limiter';
import { BcpSource } from '../src/bcp/source';
import type { BcpRequest, BcpTransport } from '../src/bcp/transport';
import { loadConfig } from '../src/config';
import { createDb } from '../src/db/client';
import { createLogger } from '../src/logger';

/** Passes requests through and writes an anonymised copy of each response to disk. */
class RecordingTransport implements BcpTransport {
  readonly #inner: BcpTransport;
  readonly #outDir: string;
  readonly #anonymiser = new Anonymiser();

  constructor(inner: BcpTransport, outDir: string) {
    this.#inner = inner;
    this.#outDir = outDir;
  }

  async get(request: BcpRequest): Promise<unknown> {
    const body = await this.#inner.get(request);
    const file = path.join(this.#outDir, fixtureFileFor(request));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(this.#anonymiser.anonymise(body), null, 2)}\n`);
    return body;
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lists: { type: 'string', default: '10' },
    out: { type: 'string', default: '../../fixtures/bcp/recorded' },
  },
});
const eventId = positionals[0];
if (!eventId) {
  console.error('Usage: pnpm --filter @bcp/api record-fixtures <eventId> [--lists 10] [--out DIR]');
  process.exit(1);
}

const config = loadConfig();
const logger = createLogger('info', true);

const database = createDb(config.DATABASE_URL);
await database.migrate();

try {
  const auth = new BcpAuth({
    apiUrl: config.BCP_API_URL,
    store: createDbSessionStore(database.db),
    envRefreshToken: config.BCP_REFRESH_TOKEN,
    envAccessToken: config.BCP_ACCESS_TOKEN,
    logger,
  });
  const http = new HttpTransport({
    baseUrl: config.BCP_API_URL,
    timeoutMs: config.BCP_TIMEOUT_MS,
    maxAttempts: config.BCP_MAX_ATTEMPTS,
    limiter: new RateLimiter({
      requestsPerSecond: config.BCP_REQUESTS_PER_SECOND,
      maxConcurrency: config.BCP_MAX_CONCURRENCY,
    }),
    auth,
    logger,
  });
  const outDir = path.resolve(values.out);
  const source = new BcpSource(new RecordingTransport(http, outDir));

  const event = await source.getEvent(eventId);
  logger.info({ name: event.name, rounds: event.roundCount, team: event.isTeamEvent }, 'Event');

  const day = event.startDate.slice(0, 10);
  await source.listEvents({ from: day, to: day }, null);

  const players = await source.getPlayers(eventId);
  if (event.isTeamEvent) await source.getTeams(eventId);
  for (let round = 1; round <= event.roundCount; round += 1) {
    if (event.isTeamEvent) await source.getTeamMatchups(eventId, round);
    const games = await source.getGames(eventId, round);
    logger.info({ round, games: games.length }, 'Round recorded');
  }

  const listIds = players.flatMap((player) => (player.listBcpId ? [player.listBcpId] : []));
  let listsFetched = 0;
  for (const listId of listIds.slice(0, Number(values.lists))) {
    if (await source.getList(listId)) listsFetched += 1;
  }

  logger.info(
    { outDir, players: players.length, listsFetched, auth: await auth.status() },
    'Recording complete',
  );
} finally {
  await database.close();
}
