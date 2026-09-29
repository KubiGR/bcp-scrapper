import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { events, players, teams } from '../db/schema';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { ALL_EVENTS, sampleSource } from '../test/helpers';
import { loadRankings, playerRanking, rankingsPage, topRanks } from './rankings';

const TODAY = new Date('2026-09-29T12:00:00Z');
let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await syncEvent({ db, source: sampleSource() }, 'EVTTEAM0001');
});

describe('loadRankings', () => {
  it('scores team events by the team’s placing, shared by its members', async () => {
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    // 4 placed teams, 8 players: TM-CHARLIE (1st) = 100 × 1 × ln 8 / ln 100.
    const top = ranked.slice(0, 2);
    expect(top.map((p) => p.userId).sort()).toEqual(['US-EVE', 'US-FINN']);
    expect(top[0]?.points).toBeCloseTo(45.15, 1);
    expect(ranked).toHaveLength(8);
  });

  it('leaves out unplaced entries, and counts N from placed ones', async () => {
    await db.update(teams).set({ placing: null }).where(eq(teams.id, 'TM-DELTA'));
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    expect(ranked.map((p) => p.userId)).not.toContain('US-GIA');
    // 3 placed teams now: TM-ALPHA (2nd) scores (3 − 2) / 2.
    expect(ranked.find((p) => p.userId === 'US-ADA')?.points).toBeCloseTo(45.15 / 2, 1);
  });

  it('counts only finished big events, and only players with an account', async () => {
    await db.update(players).set({ bcpUserId: null }).where(eq(players.id, 'PL-ADA'));
    expect((await loadRankings(db, ALL_EVENTS, TODAY)).map((p) => p.userId)).not.toContain(
      'US-ADA',
    );
    expect(await loadRankings(db, { minRounds: 3, minPlayers: 8 }, TODAY)).toEqual([]);
    await db.update(events).set({ ended: false, endDate: new Date('2026-10-01') });
    expect(await loadRankings(db, ALL_EVENTS, new Date('2026-03-28T12:00:00Z'))).toEqual([]);
  });
});

describe('rankingsPage', () => {
  it('searches names as plain text, filters by faction and pages, keeping ranks', async () => {
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    const page = rankingsPage(ranked, { search: 'ADA', offset: 0, limit: 100 });
    expect(page.players.map((p) => p.userId)).toEqual(['US-ADA']);
    expect(page.players[0]?.rank).toBe(ranked.find((p) => p.userId === 'US-ADA')?.rank);
    expect(rankingsPage(ranked, { search: '%', offset: 0, limit: 100 }).total).toBe(0);
    expect(rankingsPage(ranked, { search: '.*', offset: 0, limit: 100 }).total).toBe(0);
    const paged = rankingsPage(ranked, { offset: 2, limit: 3 });
    expect(paged.players.map((p) => p.rank)).toEqual([3, 4, 5]);
    expect(paged.total).toBe(8);
    const faction = ranked[0]?.factions[0];
    if (faction !== undefined) {
      const filtered = rankingsPage(ranked, { faction, offset: 0, limit: 100 });
      expect(filtered.players.every((p) => p.factions.includes(faction))).toBe(true);
    }
  });

  it('gives the top ranks by account', async () => {
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    const { ranks } = topRanks(ranked);
    expect(Object.keys(ranks)).toHaveLength(8);
    expect(ranks[ranked[0]?.userId ?? '']).toBe(1);
  });
});

describe('playerRanking', () => {
  it('gives a player’s rank, points and history with the counted results marked', async () => {
    await syncEvent({ db, source: sampleSource() }, 'EVTBRACKET01');
    await db.update(players).set({ bcpUserId: 'US-ADA' }).where(eq(players.id, 'PB-R1'));
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    const ada = await playerRanking(db, ranked, 'US-ADA');
    expect(ada?.history.map((h) => h.eventId)).toEqual(['EVTBRACKET01', 'EVTTEAM0001']);
    expect(ada?.history.every((h) => h.counts && h.score !== null)).toBe(true);
    expect(ada?.rank).toBe(ranked.findIndex((p) => p.userId === 'US-ADA') + 1);
    expect(ada?.dropsOn).toBe('2027-03-28');
  });

  it('answers a player without counted results with rank null', async () => {
    await db.update(events).set({ startDate: new Date('2025-01-01') });
    const ranked = await loadRankings(db, ALL_EVENTS, TODAY);
    const ada = await playerRanking(db, ranked, 'US-ADA');
    expect(ada).toMatchObject({ rank: null, points: 0, dropsOn: null });
    expect(ada?.history[0]).toMatchObject({ score: null, counts: false });
    expect(await playerRanking(db, ranked, 'US-NOBODY')).toBeNull();
  });
});
