import { quartiles } from './DamageChart';

/**
 * What to expect from a distribution, as UnitCrunch puts it: the median (half of results are at
 * most this, a whole number that can happen) leads, with the mean and the single most likely total.
 */
export function expected(dist: number[]): { median: number; mean: number; mode: number } {
  const mean = dist.reduce((sum, p, n) => sum + p * n, 0);
  const mode = dist.reduce((best, p, n) => (p > (dist[best] ?? 0) ? n : best), 0);
  return { median: quartiles(dist)[1], mean, mode };
}
