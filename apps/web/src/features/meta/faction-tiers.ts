import type { MetaRow } from '@bcp/shared';

export type TierKey = 'S' | 'A' | 'B' | 'C' | 'D';

export interface Tier {
  key: TierKey;
  name: string;
  /** The win rates it covers, as shown in its heading. */
  range: string;
  /** The lowest win rate in it, in percent (one decimal, as shown). */
  min: number;
}

/** D takes everything below C. */
const WEAK: Tier = { key: 'D', name: 'Weak', range: 'under 46%', min: -Infinity };

/** Tiers by win rate, best first. */
export const TIERS: readonly Tier[] = [
  { key: 'S', name: 'Dominant', range: '55%+', min: 55 },
  { key: 'A', name: 'Strong', range: '52–55%', min: 52 },
  { key: 'B', name: 'Even', range: '49–52%', min: 49 },
  { key: 'C', name: 'Struggling', range: '46–49%', min: 46 },
  WEAK,
];

/** A win rate as shown in the tier table: one decimal ("54.7%"). */
const shownPercent = (rate: number) => Math.round(rate * 1000) / 10;
export const tierPercent = (rate: number) => `${shownPercent(rate).toFixed(1)}%`;

/** A win rate's tier, by the percentage shown, so 54.96% (shown 55.0%) is S. */
export function tierOf(winRate: number): Tier {
  const shown = shownPercent(winRate);
  return TIERS.find((tier) => shown >= tier.min) ?? WEAK;
}

export interface TierGroup<T> {
  /** Null = too few players to be given a tier. */
  tier: Tier | null;
  rows: T[];
}

/**
 * Rows in tier order, keeping their order within each tier; empty tiers are left out, and rows
 * with fewer than `minPlayers` players come last, untiered.
 */
export function groupByTier<T extends Pick<MetaRow, 'winRate' | 'players'>>(
  rows: T[],
  minPlayers: number,
): TierGroup<T>[] {
  const groups: TierGroup<T>[] = TIERS.map((tier) => ({
    tier,
    rows: rows.filter((row) => row.players >= minPlayers && tierOf(row.winRate) === tier),
  }));
  groups.push({ tier: null, rows: rows.filter((row) => row.players < minPlayers) });
  return groups.filter((group) => group.rows.length > 0);
}

/** The win-rate bar's ends: rates outside them pin to the edge. */
const BAR_LOW = 0.35;
const BAR_HIGH = 0.65;
const barAt = (rate: number) =>
  Math.min(1, Math.max(0, (rate - BAR_LOW) / (BAR_HIGH - BAR_LOW))) * 100;

/** The bar's fill from even (50%) to the win rate, as left and width percentages of its track. */
export function winRateFill(rate: number): { left: number; width: number } {
  const even = barAt(0.5);
  const at = barAt(rate);
  return { left: Math.min(even, at), width: Math.abs(at - even) };
}

/** The podium: the three best win rates among factions with enough players to be tiered. */
export function podiumOf<T extends Pick<MetaRow, 'winRate' | 'players'>>(
  rows: T[],
  minPlayers: number,
): T[] {
  return rows
    .filter((row) => row.players >= minPlayers)
    .sort((a, b) => b.winRate - a.winRate || b.players - a.players)
    .slice(0, 3);
}

/**
 * The biggest moves in win rate, up and down, among factions with enough players and a change
 * (enough games in both spans); at most `count` each.
 */
export function movementOf<T extends Pick<MetaRow, 'change' | 'players'>>(
  rows: T[],
  minPlayers: number,
  count = 4,
): { risers: T[]; fallers: T[] } {
  const moved = rows.filter((row) => row.players >= minPlayers && row.change !== null);
  const by = (sign: 1 | -1) =>
    moved
      .filter((row) => sign * (row.change ?? 0) > 0)
      .sort((a, b) => sign * ((b.change ?? 0) - (a.change ?? 0)))
      .slice(0, count);
  return { risers: by(1), fallers: by(-1) };
}
