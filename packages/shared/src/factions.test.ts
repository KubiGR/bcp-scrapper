import { describe, expect, it } from 'vitest';
import { isAllegiance, resolveFaction } from './factions';

describe('isAllegiance', () => {
  it('knows the allegiances BCP offers instead of an army', () => {
    for (const name of [
      'Chaos',
      ' xenos ',
      'Imperium',
      'Forces of the Hive Mind',
      'Forces of the Imperium',
    ]) {
      expect(isAllegiance(name), name).toBe(true);
    }
    for (const name of ['Chaos Daemons', 'Imperial Knights', 'Orks']) {
      expect(isAllegiance(name), name).toBe(false);
    }
  });
});

describe('resolveFaction', () => {
  it('keeps BCP’s faction when it is a real one', () => {
    expect(resolveFaction('Orks', 'Necrons')).toEqual({ faction: 'Orks', factionGuessed: false });
  });
  it('guesses from the list when BCP has none or only an allegiance', () => {
    expect(resolveFaction(null, 'Necrons')).toEqual({ faction: 'Necrons', factionGuessed: true });
    expect(resolveFaction('Chaos', 'Chaos Space Marines')).toEqual({
      faction: 'Chaos Space Marines',
      factionGuessed: true,
    });
  });
  it('keeps what BCP has when there is no parsed army', () => {
    expect(resolveFaction('Chaos', null)).toEqual({ faction: 'Chaos', factionGuessed: false });
    expect(resolveFaction(null, null)).toEqual({ faction: null, factionGuessed: false });
  });
});
