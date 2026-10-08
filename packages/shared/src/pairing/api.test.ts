// packages/shared/src/pairing/api.test.ts
import { describe, expect, it } from 'vitest';
import { PairingResponseSchema, SaveRatingRequestSchema } from './api';

describe('pairing API schemas', () => {
  it('accept a full response and refuse an unknown chip', () => {
    const team = { id: 'T1', name: 'Dice Bunker' };
    const player = {
      id: 'P1',
      name: 'Kubi',
      faction: 'Space Marines',
      detachments: [],
      list: null,
    };
    expect(
      PairingResponseSchema.parse({
        team,
        opponent: { id: 'T2', name: 'Mighty Ducks' },
        ours: [player],
        theirs: [],
        ratings: [{ playerId: 'P1', opponentPlayerId: 'Q1', chip: 'GG' }],
        problem: null,
      }).ratings[0]?.chip,
    ).toBe('GG');
    expect(SaveRatingRequestSchema.safeParse({ chip: 'XX' }).success).toBe(false);
    expect(SaveRatingRequestSchema.parse({ chip: null }).chip).toBeNull();
  });
});
