import { describe, expect, it } from 'vitest';
import { usedPlayers } from './used-players';

// We defend World Eaters (3), they Custodes (4).
describe('usedPlayers', () => {
  it('nobody is used while just planning', () => {
    expect(usedPlayers(3, 4, {})).toEqual({ ours: [], theirs: [], games: [] });
  });

  it('a round-1 defender is used once chosen, both once the pairing has moved on', () => {
    expect(usedPlayers(3, 4, { ourDefender: true })).toEqual({ ours: [3], theirs: [], games: [] });
    expect(usedPlayers(3, 4, { theirDefender: true })).toEqual({
      ours: [],
      theirs: [4],
      games: [],
    });
    expect(usedPlayers(3, 4, { theirSend: '1,2' })).toEqual({ ours: [3], theirs: [4], games: [] });
  });

  it('each pick locks a game and uses both its players', () => {
    // We take Orks (2) with World Eaters; they take Emperor's Children (1) with Custodes.
    expect(usedPlayers(3, 4, { theirSend: '1,2', weTake: 2 })).toEqual({
      ours: [3],
      theirs: [4, 2],
      games: [[3, 2]],
    });
    expect(usedPlayers(3, 4, { theirSend: '1,2', weTake: 2, theyTake: 1 })).toEqual({
      ours: [3, 1],
      theirs: [4, 2],
      games: [
        [3, 2],
        [1, 4],
      ],
    });
  });

  it('round-2 defenders are used once chosen', () => {
    const used = usedPlayers(3, 4, {
      theirSend: '1,2',
      weTake: 2,
      theyTake: 1,
      ourR2: 0,
      theirR2: 3,
    });
    expect(used.ours).toEqual([3, 1, 0]);
    expect(used.theirs).toEqual([4, 2, 3]);
  });
});
