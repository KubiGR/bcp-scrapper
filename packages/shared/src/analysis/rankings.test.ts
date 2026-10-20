import { describe, expect, it } from 'vitest';
import {
  computeRankings,
  eventScore,
  placingScore,
  sizeFactor,
  strengthFactor,
  type RankingResult,
} from './rankings';

const TODAY = new Date('2026-09-29T12:00:00Z');
const result = (overrides: Partial<RankingResult> = {}): RankingResult => ({
  userId: 'U1',
  name: 'Ada Archer',
  eventId: 'E1',
  eventName: 'London GT',
  eventStart: '2026-09-01',
  isTeamEvent: false,
  teamName: null,
  placing: 1,
  field: 100,
  players: 100,
  faction: 'Orks',
  ...overrides,
});

describe('scoring', () => {
  it('scores placing from 1 for first to 0 for last', () => {
    expect(placingScore(1, 100)).toBe(1);
    expect(placingScore(100, 100)).toBe(0);
    expect(placingScore(1, 1)).toBe(1);
    expect(placingScore(11, 21)).toBeCloseTo(0.5);
    expect(placingScore(30, 20)).toBe(0);
  });

  it('grows with the square root of event size: 1 at 100 players, more above', () => {
    expect(sizeFactor(20)).toBeCloseTo(0.4472, 3);
    expect(sizeFactor(40)).toBeCloseTo(0.6325, 3);
    expect(sizeFactor(100)).toBe(1);
    expect(sizeFactor(400)).toBe(2);
    expect(sizeFactor(1000)).toBeCloseTo(3.1623, 3);
  });

  it('scores 100 for winning a 100-player event', () => {
    expect(eventScore({ placing: 1, field: 100, players: 100 })).toBe(100);
    expect(eventScore({ placing: 1, field: 20, players: 20 })).toBeCloseTo(44.72, 1);
    expect(eventScore({ placing: 1, field: 400, players: 400 })).toBe(200);
  });
});

describe('field strength', () => {
  it('weighs a field by its average wh40k-elo: ×1 at 1550, +50% per 100 above, within 0.75–1.5', () => {
    expect(strengthFactor(1550)).toBe(1);
    expect(strengthFactor(1650)).toBe(1.5);
    expect(strengthFactor(1600)).toBe(1.25);
    expect(strengthFactor(1500)).toBe(0.75);
    expect(strengthFactor(1747)).toBe(1.5);
    expect(strengthFactor(1400)).toBe(0.75);
    // Unknown (too few rated players): neutral.
    expect(strengthFactor(null)).toBe(1);
    expect(strengthFactor(undefined)).toBe(1);
  });

  it('multiplies an event’s score by its field’s strength', () => {
    expect(eventScore({ placing: 1, field: 100, players: 100, fieldElo: 1600 })).toBe(125);
    expect(eventScore({ placing: 1, field: 100, players: 100, fieldElo: null })).toBe(100);
  });

  it('ranks a win at a strong event above the same win at a weak one', () => {
    const ranked = computeRankings(
      [
        result({ userId: 'A-WEAK', eventId: 'E1', fieldElo: 1480 }),
        result({ userId: 'STRONG', eventId: 'E2', fieldElo: 1640 }),
      ],
      TODAY,
    );
    expect(ranked.map((p) => p.userId)).toEqual(['STRONG', 'A-WEAK']);
    expect(ranked[0]?.best.fieldElo).toBe(1640);
  });
});

describe('computeRankings', () => {
  it('adds up each player’s 5 best results and ranks by points', () => {
    const ada = [100, 90, 80, 70, 60, 10].map((_, i) =>
      result({ eventId: `A${String(i)}`, placing: [1, 11, 21, 31, 41, 91][i] ?? 1 }),
    );
    const ben = [result({ userId: 'U2', name: 'Ben Brass', placing: 1 })];
    const [first, second] = computeRankings([...ada, ...ben], TODAY);
    expect(first).toMatchObject({ rank: 1, userId: 'U1', counted: 5, results: 6 });
    // 1st, 11th, 21st, 31st, 41st of 100: 100 + 89.9 + 79.8 + 69.7 + 59.6.
    expect(first?.points).toBeCloseTo(398.99, 1);
    expect(first?.scores.filter((s) => s.counts)).toHaveLength(5);
    expect(second).toMatchObject({ rank: 2, userId: 'U2', points: 100 });
  });

  it('counts only results from the last 12 months', () => {
    const ranked = computeRankings(
      [result({ eventStart: '2025-09-29' }), result({ eventId: 'E2', eventStart: '2025-09-30' })],
      TODAY,
    );
    expect(ranked[0]?.results).toBe(1);
  });

  it('breaks ties by more results, then best result, then name', () => {
    const ranked = computeRankings(
      [
        result({ userId: 'U1', name: 'Zed', placing: 51, field: 101 }), // 50
        result({ userId: 'U2', name: 'Amy', placing: 76, field: 101 }), // 25
        result({ userId: 'U2', name: 'Amy', eventId: 'E2', placing: 76, field: 101 }), // 25
        result({ userId: 'U3', name: 'Bob', placing: 51, field: 101 }), // 50
      ],
      TODAY,
    );
    expect(ranked.map((p) => p.name)).toEqual(['Amy', 'Bob', 'Zed']);
    expect(ranked.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it('ranks players tied on everything by account id, so ranks never swap', () => {
    const twins = [
      result({ userId: 'U2', name: 'Same Name' }),
      result({ userId: 'U1', name: 'Same Name' }),
    ];
    expect(computeRankings(twins, TODAY).map((p) => p.userId)).toEqual(['U1', 'U2']);
    expect(computeRankings([...twins].reverse(), TODAY).map((p) => p.userId)).toEqual(['U1', 'U2']);
  });

  it('counts a player entered twice in one event once, with their better placing', () => {
    const [ada] = computeRankings(
      [result({ placing: 1 }), result({ placing: 50 }), result({ eventId: 'E2', placing: 1 })],
      TODAY,
    );
    expect(ada?.results).toBe(2);
    expect(ada?.points).toBe(200);
  });

  it('names a player by their newest counted result, with their 2 most played factions', () => {
    const [ada] = computeRankings(
      [
        result({ name: 'Ada A.', eventStart: '2026-01-01', faction: 'Necrons' }),
        result({ eventId: 'E2', name: 'Ada Archer', eventStart: '2026-09-01' }),
        result({ eventId: 'E3', eventStart: '2026-05-01', faction: 'Orks' }),
        result({ eventId: 'E4', eventStart: '2026-04-01', faction: 'Tyranids' }),
        result({ eventId: 'E5', eventStart: '2026-03-01', faction: 'Tyranids' }),
      ],
      TODAY,
    );
    expect(ada?.name).toBe('Ada Archer');
    expect(ada?.factions).toEqual(['Orks', 'Tyranids']);
    expect(ada?.scores.map((s) => s.eventId)).toEqual(['E2', 'E3', 'E4', 'E5', 'E1']);
  });
});
