import { simulate, type Calculation, type CalculationResult } from '@bcp/shared';
import { expected } from './expected';

/** Rolled games: how often each number of models slain and wounds lost came up. */
export interface MonteCarlo {
  games: number;
  modelsSlain: number[];
  woundsDealt: number[];
  wasted: number;
}

/**
 * Rolls `games` games die by die, as a check on the exact calculation: in a worker when the
 * browser has them, in place otherwise (tests).
 */
export function runMonteCarlo(
  calculation: Calculation,
  orders: number[][],
  games: number,
): Promise<MonteCarlo> {
  const seed = Math.floor(Math.random() * 2 ** 31);
  if (typeof Worker === 'undefined') {
    return Promise.resolve({ games, ...simulate(calculation, orders, games, seed) });
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./monte-carlo.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<MonteCarlo>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = (event) => {
      reject(new Error(event.message || 'The games couldn’t be rolled'));
      worker.terminate();
    };
    worker.postMessage({ calculation, orders, games, seed });
  });
}

export interface CompareRow {
  label: string;
  exact: string;
  simulated: string;
  diff: string;
}

const signed = (n: number, digits: number, unit = '') => {
  const text = Math.abs(n).toFixed(digits);
  if (Number(text) === 0) return `${(0).toFixed(digits)}${unit}`;
  return `${n > 0 ? '+' : '−'}${text}${unit}`;
};
const mean = (dist: number[]) => dist.reduce((sum, p, n) => sum + p * n, 0);

/** The exact numbers beside the rolled ones, and how far apart they are. */
export function compareRows(
  exact: CalculationResult,
  sim: MonteCarlo,
  /** The target's models: all of them slain is a wipe. */
  models: number,
): CompareRow[] {
  const wipe = sim.modelsSlain[models] ?? 0;
  // Two standard errors: the rolled chance lands within this of the true one 95% of the time.
  const margin = 2 * Math.sqrt((wipe * (1 - wipe)) / sim.games);
  const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
  const row = (label: string, a: number, b: number, digits = 3): CompareRow => ({
    label,
    exact: a.toFixed(digits),
    simulated: b.toFixed(digits),
    diff: signed(b - a, digits),
  });
  return [
    row('Models slain (average)', exact.averages.modelsSlain, mean(sim.modelsSlain)),
    row(
      'Models slain (median)',
      expected(exact.modelsSlain).median,
      expected(sim.modelsSlain).median,
      0,
    ),
    row('Wounds dealt (average)', exact.averages.woundsDealt, mean(sim.woundsDealt)),
    row('Wasted damage (average)', exact.averages.wasted, sim.wasted),
    {
      label: 'Wipe',
      exact: pct(exact.wipe),
      simulated: `${pct(wipe)} ± ${pct(margin)}`,
      diff: signed((wipe - exact.wipe) * 100, 1, '%'),
    },
  ];
}
