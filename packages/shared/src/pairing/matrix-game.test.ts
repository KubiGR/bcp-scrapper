// packages/shared/src/pairing/matrix-game.test.ts
import { describe, expect, it } from 'vitest';
import { solveMatrixGame } from './matrix-game';

const close = (a: number, b: number) => {
  expect(a).toBeCloseTo(b, 9);
};

describe('solveMatrixGame', () => {
  it('matching pennies: value 0, both play 50/50', () => {
    const s = solveMatrixGame([
      [1, -1],
      [-1, 1],
    ]);
    close(s.value, 0);
    s.rows.forEach((p) => {
      close(p, 0.5);
    });
    s.cols.forEach((p) => {
      close(p, 0.5);
    });
  });

  it('rock-paper-scissors: thirds', () => {
    const s = solveMatrixGame([
      [0, -1, 1],
      [1, 0, -1],
      [-1, 1, 0],
    ]);
    close(s.value, 0);
    s.rows.forEach((p) => {
      close(p, 1 / 3);
    });
  });

  it('a dominant row is played for sure', () => {
    const s = solveMatrixGame([
      [3, 5],
      [1, 2],
    ]);
    close(s.value, 3);
    expect(s.rows).toEqual([1, 0]);
  });

  it('a 1 x N game: the column player picks the lowest', () => {
    close(solveMatrixGame([[4, 2, 9]]).value, 2);
  });

  it('every entry equal: solves, value is that entry', () => {
    close(
      solveMatrixGame([
        [10, 10],
        [10, 10],
      ]).value,
      10,
    );
  });
});
