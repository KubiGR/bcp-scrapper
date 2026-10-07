import { simulate, type Calculation } from '@bcp/shared';

/** Rolls the games off the page's thread, so the page stays responsive meanwhile. */
self.onmessage = (
  event: MessageEvent<{
    calculation: Calculation;
    orders: number[][];
    games: number;
    seed: number;
  }>,
) => {
  const { calculation, orders, games, seed } = event.data;
  self.postMessage({ games, ...simulate(calculation, orders, games, seed) });
};
