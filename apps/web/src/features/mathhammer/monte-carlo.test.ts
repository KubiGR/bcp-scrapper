import { calculate } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { defaultForm, toCalculation } from './form-state';
import { compareRows, runMonteCarlo } from './monte-carlo';

const setup = () => {
  const read = toCalculation(defaultForm());
  if (!('calculation' in read)) throw new Error(read.error);
  return { calculation: read.calculation, result: calculate(read.calculation) };
};

describe('Monte Carlo check', () => {
  it('rolls the games and agrees with the exact result, within its noise', async () => {
    const { calculation, result } = setup();
    const sim = await runMonteCarlo(calculation, result.orders, 20_000);
    expect(sim.games).toBe(20_000);
    const mean = sim.modelsSlain.reduce((sum, p, n) => sum + p * n, 0);
    expect(Math.abs(mean - result.averages.modelsSlain)).toBeLessThan(0.05);
  });

  it('lines each number up with the exact one and the difference', async () => {
    const { calculation, result } = setup();
    const sim = await runMonteCarlo(calculation, result.orders, 20_000);
    const rows = compareRows(result, sim, 10);
    expect(rows.map((r) => r.label)).toEqual([
      'Models slain (average)',
      'Models slain (median)',
      'Wounds dealt (average)',
      'Wasted damage (average)',
      'Wipe',
    ]);
    const slain = rows[0];
    expect(slain?.exact).toBe(result.averages.modelsSlain.toFixed(3));
    expect(slain?.diff).toMatch(/^[+−]?\d\.\d{3}$/);
    // The wipe chance carries its margin (two standard errors).
    expect(rows[4]?.simulated).toMatch(/±/);
  });
});
