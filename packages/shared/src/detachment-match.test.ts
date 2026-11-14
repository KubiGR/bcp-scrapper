import { describe, expect, it } from 'vitest';
import { matchDetachment } from './detachment-match';

describe('matchDetachment', () => {
  const candidates = ['Needgaârd Oathband', 'Hearthband', "The Phaeron's Armoury", 'War Horde'];

  it('matches exactly, then ignoring case, spacing, accents, apostrophes and hyphens', () => {
    expect(matchDetachment('Hearthband', candidates)).toBe('Hearthband');
    expect(matchDetachment('needgaard  oathband', candidates)).toBe('Needgaârd Oathband');
    expect(matchDetachment('The Phaerons Armoury', candidates)).toBe("The Phaeron's Armoury");
    expect(matchDetachment('War-Horde', candidates)).toBe('War Horde');
  });

  it('matches a short name that ends exactly one candidate', () => {
    expect(matchDetachment('Oathband', candidates)).toBe('Needgaârd Oathband');
    expect(matchDetachment('Band', ['Hearthband', 'Oath Band', 'War Band'])).toBeNull();
  });

  it('only takes exact or loose matches when told not to guess', () => {
    const strict = { fuzzy: false };
    expect(matchDetachment('needgaard oathband', candidates, strict)).toBe('Needgaârd Oathband');
    expect(matchDetachment('Oathband', candidates, strict)).toBeNull();
    expect(matchDetachment('Hearthbnad', candidates, strict)).toBeNull();
  });

  it('needs 6+ letters to match by a candidate’s last words', () => {
    expect(matchDetachment('Horde', ['War Horde'])).toBeNull();
    expect(matchDetachment('Armoury', ["The Phaeron's Armoury"])).toBe("The Phaeron's Armoury");
  });

  it('allows up to 2 letters off on names of 8+ letters, only with one clear match', () => {
    expect(matchDetachment('Hearthbnad', candidates)).toBe('Hearthband');
    expect(matchDetachment('Wor Hord', candidates)).toBeNull(); // short: no typo matching
    expect(matchDetachment('Blood Legion', ['Blood Legions', 'Blood Legian'])).toBeNull();
    expect(matchDetachment('Something Else', candidates)).toBeNull();
  });
});
