import { describe, expect, it } from 'vitest';
import { shortArmy } from './army-name';

describe('shortArmy', () => {
  it('uses the usual short names', () => {
    expect(shortArmy('Chaos Space Marines')).toBe('CSM');
    expect(shortArmy('Space Marines (Astartes)')).toBe('SM');
    expect(shortArmy('Adeptus Custodes')).toBe('Custodes');
    expect(shortArmy('Emperor’s Children')).toBe('EC');
    expect(shortArmy("T'au Empire")).toBe('Tau');
    expect(shortArmy('Genestealer Cults')).toBe('GSC');
  });

  it('keeps names that are short already, or unknown', () => {
    expect(shortArmy('Orks')).toBe('Orks');
    expect(shortArmy('Necrons')).toBe('Necrons');
    expect(shortArmy('Squats of the Old Days')).toBe('Squats of the Old Days');
  });
});
