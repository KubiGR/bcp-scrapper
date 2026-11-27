import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { FixtureTransport } from '../bcp/fixture-transport';
import { BcpSource } from '../bcp/source';
import { createDb, PGLITE_MEMORY_URL } from '../db/client';
import { BcpUnavailableError } from '../errors';
import { createLogger } from '../logger';
import { upsertEventDetail } from '../repo/events';
import { enqueueLists } from '../repo/fetch-queue';
import { upsertPlayers } from '../repo/participants';
import { FetchQueueWorker } from './worker';

class DemoSource extends BcpSource {
  #interruptFirstFetch = true;

  override async getList(listId: string) {
    if (listId === 'LS-ADA' && this.#interruptFirstFetch) {
      this.#interruptFirstFetch = false;
      throw new BcpUnavailableError('Simulated temporary fetch failure');
    }
    return super.getList(listId);
  }
}

const fixtures = fileURLToPath(new URL('../../../../fixtures/bcp/sample', import.meta.url));
const source = new DemoSource(new FixtureTransport(fixtures));
const database = createDb(PGLITE_MEMORY_URL);
const { db } = database;
const event = 'EVTTEAM0001';
let clock = Date.now() + 1_000;
const worker = new FetchQueueWorker({
  db,
  source,
  logger: createLogger('info', false).child({ module: 'fetch-queue' }),
  intervalMs: 5_000,
  now: () => new Date(clock),
});

try {
  await database.migrate();
  await upsertEventDetail(db, await source.getEvent(event));
  await upsertPlayers(db, await source.getPlayers(event));

  await enqueueLists(db, event, [{ playerId: 'PL-ADA', listId: 'LS-ADA' }], 0);
  clock = Date.now() + 1_000;
  assert.equal(await worker.tick(), 'retry');
  clock += 61_000;
  assert.equal(await worker.tick(), 'fetched');

  await enqueueLists(db, event, [{ playerId: 'PL-HAL', listId: 'LS-NONE' }], 0);
  assert.equal(await worker.tick(), 'failed');
} finally {
  await database.close();
}
