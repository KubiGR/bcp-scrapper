import type { GameUpdate, GameUpdatesResponse } from '@bcp/shared';

/** A game update for tests (one read from BSData unless overridden). */
export const aGameUpdate = (overrides: Partial<GameUpdate> = {}): GameUpdate => ({
  id: 'b',
  name: 'Jul 2026 · MFM',
  autoName: 'Jul 2026 · MFM',
  start: '2026-07-22',
  autoStart: '2026-07-22',
  merged: false,
  hidden: false,
  events: 2,
  summary: 'Orks, Tyranids',
  added: false,
  suggestions: ['Jul 2026 · MFM', 'Orks shake-up', 'Update 2 · Jul 2026'],
  ...overrides,
});

/** Two updates, newest first: Jul 2026 (b) and Jun 2026 (a). */
export const twoUpdates = (): GameUpdatesResponse => ({
  updates: [
    aGameUpdate(),
    aGameUpdate({
      id: 'a',
      name: 'Jun 2026 · Faction Packs',
      autoName: 'Jun 2026 · Faction Packs',
      start: '2026-06-09',
      autoStart: '2026-06-09',
      events: 5,
      summary: 'Aeldari',
      suggestions: ['Jun 2026 · Faction Packs', 'Edition launch'],
    }),
  ],
});
