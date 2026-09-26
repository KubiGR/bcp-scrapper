import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { events, fetchQueue, players } from '../db/schema';
import { enqueueEventPairings } from './fetch-queue';
import { loadMatchupGames, pairingsStates } from './matchups';
import { syncEvent } from '../sync/jobs';
import { syncRoundPairings } from '../sync/round-pairings';
import { sampleSource, silentLogger } from '../test/helpers';
import { gwList, storeList } from '../test/lists';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

async function loadBracketEvent() {
  const source = sampleSource();
  const event = await syncEvent({ db, source }, 'EVTBRACKET01');
  for (let round = 1; round <= event.roundCount; round += 1) {
    await syncRoundPairings({ db, source, logger: silentLogger }, event, round);
  }
}

describe('loadMatchupGames', () => {
  it('uses the army read from the list when BCP has none, and adds detachments', async () => {
    await loadBracketEvent();
    await db.update(players).set({ faction: 'Xenos' }).where(eq(players.id, 'PB-B1'));
    await storeList(db, 'PB-B1', gwList('Orks', 'War Horde'));
    await storeList(db, 'PB-R1', gwList('Adepta Sororitas', 'Hallowed Martyrs'));
    const first = (await loadMatchupGames(db, ['EVTBRACKET01'])).find((g) => g.id === 'GB-R1-1');
    expect(first?.a).toMatchObject({
      faction: 'Adepta Sororitas',
      factionGuessed: false,
      detachments: ['Hallowed Martyrs'],
    });
    expect(first?.b).toMatchObject({
      faction: 'Orks',
      factionGuessed: true,
      detachments: ['War Horde'],
    });
  });

  it('loads each game with both sides’ faction, disposition and team', async () => {
    await loadBracketEvent();
    const games = await loadMatchupGames(db, ['EVTBRACKET01']);
    expect(games).toHaveLength(14);
    const first = games.find((g) => g.id === 'GB-R1-1');
    expect(first).toMatchObject({
      eventId: 'EVTBRACKET01',
      eventName: 'Sample Bracket Teams',
      round: 1,
      a: { playerId: 'PB-R1', faction: 'Adepta Sororitas', teamName: 'Red Legion' },
      b: { playerId: 'PB-B1', faction: 'Necrons', teamName: 'Blue Wardens' },
      pointsA: 20,
      pointsB: 0,
      result: 'a_win',
    });
    expect(games.find((g) => g.id === 'GB-R1-5')?.b).toBeNull(); // bye
  });
});

describe('pairingsStates', () => {
  it('reports each event’s pairings state and synced-at', async () => {
    await loadBracketEvent();
    const source = sampleSource();
    await syncEvent({ db, source }, 'EVTTEAM0001');

    let states = await pairingsStates(db, ['EVTBRACKET01', 'EVTTEAM0001']);
    // EVTBRACKET01 has all rounds stored but pairings_synced_at is only set by the queue.
    expect(states.get('EVTBRACKET01')).toMatchObject({ state: 'partial', syncedAt: null });
    // EVTTEAM0001 has an event row but no pairings stored yet.
    expect(states.get('EVTTEAM0001')).toMatchObject({ state: 'missing', syncedAt: null });

    await db
      .update(events)
      .set({ pairingsSyncedAt: new Date() })
      .where(eq(events.id, 'EVTBRACKET01'));
    states = await pairingsStates(db, ['EVTBRACKET01', 'EVTTEAM0001']);
    expect(states.get('EVTBRACKET01')?.state).toBe('synced');
    expect(states.get('EVTBRACKET01')?.syncedAt).not.toBeNull();

    await enqueueEventPairings(db, 'EVTTEAM0001', { rounds: [1], priority: 0 });
    states = await pairingsStates(db, ['EVTBRACKET01', 'EVTTEAM0001']);
    expect(states.get('EVTTEAM0001')).toMatchObject({ state: 'fetching', syncedAt: null });
  });

  it('marks synced-at even while a resync is in flight, so a refresh keeps it included', async () => {
    await loadBracketEvent();
    await db
      .update(events)
      .set({ pairingsSyncedAt: new Date() })
      .where(eq(events.id, 'EVTBRACKET01'));
    await enqueueEventPairings(db, 'EVTBRACKET01', { rounds: [1], priority: 0 });

    const states = await pairingsStates(db, ['EVTBRACKET01']);
    expect(states.get('EVTBRACKET01')).toMatchObject({ state: 'fetching' });
    expect(states.get('EVTBRACKET01')?.syncedAt).not.toBeNull();
  });

  it('reports partial when no rounds are stored but a pairings job has failed', async () => {
    const source = sampleSource();
    await syncEvent({ db, source }, 'EVTTEAM0001');
    await db.insert(fetchQueue).values({
      kind: 'pairings-round',
      eventId: 'EVTTEAM0001',
      round: 1,
      priority: 0,
      status: 'failed',
      error: 'boom',
      errorCode: 'unknown',
      finishedAt: new Date(),
    });

    const states = await pairingsStates(db, ['EVTTEAM0001']);
    expect(states.get('EVTTEAM0001')).toMatchObject({ state: 'partial', syncedAt: null });
  });
});
