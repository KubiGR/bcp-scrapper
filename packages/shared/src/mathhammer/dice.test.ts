import { describe, expect, it } from 'vitest';
import { atLeast, convolve, mean, parseDice, point, sumOf } from './dice';

describe('dice', () => {
  it('reads fixed numbers and dice', () => {
    expect(parseDice('3')).toEqual(point(3));
    const d3 = parseDice('D3') ?? [];
    expect(d3.map((p) => p.toFixed(4))).toEqual(['0.0000', '0.3333', '0.3333', '0.3333']);
    expect(mean(parseDice('2D6') ?? [])).toBeCloseTo(7);
    expect(mean(parseDice('d6 + 3') ?? [])).toBeCloseTo(6.5);
    expect(parseDice('D6+3')?.[3]).toBe(0);
    expect(parseDice('D3-1')?.[0]).toBeCloseTo(1 / 3);
  });

  it('says when it isn’t dice', () => {
    expect(parseDice('2Q')).toBeNull();
    expect(parseDice('D8')).toBeNull();
    expect(parseDice('')).toBeNull();
  });

  it('adds independent values and random counts of them', () => {
    expect(mean(convolve(point(2), parseDice('D6') ?? []))).toBeCloseTo(5.5);
    expect(mean(sumOf(point(2), parseDice('D3') ?? []))).toBeCloseTo(4);
    expect(mean(sumOf(parseDice('D3') ?? [], parseDice('D6') ?? []))).toBeCloseTo(7);
  });

  it('gives the chance of each value or more', () => {
    expect(atLeast([0.25, 0.25, 0.5])).toEqual([1, 0.75, 0.5]);
  });
});
