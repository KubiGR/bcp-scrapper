import { describe, expect, it } from 'vitest';
import { canonicalArmy, isAllegiance, resolveFaction } from './factions';

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
  it('never guesses an allegiance read from a list', () => {
    expect(resolveFaction(null, 'Chaos')).toEqual({ faction: null, factionGuessed: false });
    expect(resolveFaction('Xenos', 'Imperium')).toEqual({
      faction: 'Xenos',
      factionGuessed: false,
    });
  });

  it('keeps what BCP has when there is no parsed army', () => {
    expect(resolveFaction('Chaos', null)).toEqual({ faction: 'Chaos', factionGuessed: false });
    expect(resolveFaction(null, null)).toEqual({ faction: null, factionGuessed: false });
  });
});

describe('canonicalArmy', () => {
  it('maps an army name to BCP’s faction name', () => {
    const cases: [string, string][] = [
      ['Orks', 'Orks'],
      ['Space Marines', 'Space Marines (Astartes)'],
      ['Genestealer Cults', 'Genestealer Cult'],
      ['Tau Empire', "T'au Empire"],
      ['Emperor’s Children', "Emperor's Children"],
      ['Heretic Astartes', 'Chaos Space Marines'],
      ['Raven Guard', 'Space Marines (Astartes)'],
      ['Ultramarines', 'Space Marines (Astartes)'],
      ['Dark Angels', 'Dark Angels'],
      // Spanish
      ['Orkos', 'Orks'],
      ['Legiones Daemónicas', 'Chaos Daemons'],
      ['Hijos del Emperador', "Emperor's Children"],
      ["Imperio T'au", "T'au Empire"],
      ['Necrones', 'Necrons'],
      ['Ligas de los Votann', 'Leagues of Votann'],
      ['Tiránidos', 'Tyranids'],
      ['Cultos Genestealer', 'Genestealer Cult'],
      ['Astartes Herejes', 'Chaos Space Marines'],
      // German, French
      ['Konglomerate der Votann', 'Leagues of Votann'],
      ['Tyraniden', 'Tyranids'],
      ['Nécrons', 'Necrons'],
      ['Tyranides', 'Tyranids'],
    ];
    for (const [name, faction] of cases) {
      expect(canonicalArmy(name), name).toBe(faction);
    }
  });

  it('ignores case, accents and spacing', () => {
    expect(canonicalArmy('  legiones daemonicas ')).toBe('Chaos Daemons');
    expect(canonicalArmy('ORKS')).toBe('Orks');
  });

  it('returns null for anything that isn’t a faction', () => {
    for (const name of [
      '*****"... Small moments, unnoticed at the time..."*****',
      'Big list',
      'Chaos',
      '',
    ]) {
      expect(canonicalArmy(name), name).toBeNull();
    }
  });
});
