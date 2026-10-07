import { describe, expect, it } from 'vitest';
import { expected } from './expected';

describe('expected', () => {
  it('gives the median as the expected result, with the mean and the most likely total', () => {
    // P(0..3) = 10%, 20%, 40%, 30%: at most 1 is 30%, at most 2 is 70%.
    const e = expected([0.1, 0.2, 0.4, 0.3]);
    expect(e).toMatchObject({ median: 2, mode: 2 });
    expect(e.mean).toBeCloseTo(1.9);
  });

  it('can have a most likely total away from the median', () => {
    // A wipe is most likely, but more than half the time something survives.
    const e = expected([0.3, 0.25, 0, 0.45]);
    expect(e).toMatchObject({ median: 1, mode: 3 });
    expect(e.mean).toBeCloseTo(1.6);
  });
});
