import { describe, expect, it } from 'vitest';
import {
  groupByTier,
  movementOf,
  podiumOf,
  tierOf,
  tierPercent,
  winRateFill,
} from './faction-tiers';

describe('tierOf', () => {
  it('tiers by the win rate shown, one decimal', () => {
    expect(tierOf(0.557).key).toBe('S');
    expect(tierOf(0.54996).key).toBe('S');
    expect(tierOf(0.547).key).toBe('A');
    expect(tierOf(0.52).key).toBe('A');
    expect(tierOf(0.51).key).toBe('B');
    expect(tierOf(0.48).key).toBe('C');
    expect(tierOf(0.459).key).toBe('D');
    expect(tierOf(0).key).toBe('D');
  });

  it('shows a win rate with one decimal', () => {
    expect(tierPercent(0.5467)).toBe('54.7%');
    expect(tierPercent(0.5)).toBe('50.0%');
  });
});

describe('groupByTier', () => {
  const row = (name: string, winRate: number, players = 20) => ({ name, winRate, players });

  it('groups rows best tier first, keeping their order, and leaves out empty tiers', () => {
    const groups = groupByTier(
      [row('Orks', 0.53), row('Necrons', 0.4), row('Custodes', 0.54), row('Tau', 0.45)],
      10,
    );
    expect(groups.map((group) => group.tier?.key)).toEqual(['A', 'D']);
    expect(groups[0]?.rows.map((r) => r.name)).toEqual(['Orks', 'Custodes']);
    expect(groups[1]?.rows.map((r) => r.name)).toEqual(['Necrons', 'Tau']);
  });

  it('puts rows with too few players last, without a tier', () => {
    const groups = groupByTier([row('Grey Knights', 0.9, 2), row('Orks', 0.5)], 10);
    expect(groups.map((group) => group.tier?.key ?? null)).toEqual(['B', null]);
    expect(groups[1]?.rows.map((r) => r.name)).toEqual(['Grey Knights']);
  });
});

describe('winRateFill', () => {
  it('fills from even to the win rate, either way, pinned to the track', () => {
    expect(winRateFill(0.5)).toEqual({ left: 50, width: 0 });
    expect(winRateFill(0.65)).toEqual({ left: 50, width: 50 });
    const below = winRateFill(0.41);
    expect(below.left).toBeCloseTo(20);
    expect(below.width).toBeCloseTo(30);
    expect(winRateFill(0.9)).toEqual({ left: 50, width: 50 });
  });
});

describe('podiumOf', () => {
  it('takes the three best win rates among factions with enough players', () => {
    const rows = [
      { name: 'Orks', winRate: 0.55, players: 40 },
      { name: 'Grey Knights', winRate: 0.9, players: 2 },
      { name: 'Necrons', winRate: 0.5, players: 30 },
      { name: 'Custodes', winRate: 0.57, players: 30 },
      { name: 'Tau', winRate: 0.45, players: 30 },
    ];
    expect(podiumOf(rows, 10).map((row) => row.name)).toEqual(['Custodes', 'Orks', 'Necrons']);
  });
});

describe('movementOf', () => {
  it('lists the biggest risers and fallers, leaving out small factions and unknown changes', () => {
    const rows = [
      { name: 'Orks', change: 0.02, players: 40 },
      { name: 'Necrons', change: 0.07, players: 40 },
      { name: 'Tau', change: -0.03, players: 40 },
      { name: 'Custodes', change: null, players: 40 },
      { name: 'Grey Knights', change: 0.2, players: 2 },
      { name: 'Eldar', change: 0, players: 40 },
      { name: 'Drukhari', change: -0.05, players: 40 },
    ];
    const { risers, fallers } = movementOf(rows, 10, 4);
    expect(risers.map((row) => row.name)).toEqual(['Necrons', 'Orks']);
    expect(fallers.map((row) => row.name)).toEqual(['Drukhari', 'Tau']);
    expect(movementOf(rows, 10, 1).risers.map((row) => row.name)).toEqual(['Necrons']);
  });
});
