import { describe, expect, it } from 'vitest';
import { isConditional, keywordEffect, keywordFields, readKeywords } from './keywords';
import { NO_KEYWORDS } from './weapons';

describe('readKeywords', () => {
  it('reads the keywords that change the maths, whatever their case', () => {
    expect(
      readKeywords(
        [
          'LETHAL HITS',
          'Sustained Hits 2',
          'Devastating Wounds',
          'TWIN-LINKED',
          'Torrent',
          'HEAVY',
          'Lance',
        ],
        [],
      ),
    ).toMatchObject({
      lethalHits: true,
      sustainedHits: '2',
      devastatingWounds: true,
      twinLinked: true,
      torrent: true,
      heavy: true,
      lance: true,
    });
    expect(
      readKeywords(
        [
          'IGNORES COVER',
          'Precision',
          'INDIRECT FIRE',
          'Rapid Fire D3',
          'BLAST',
          'Cleave 2',
          'MELTA 4',
        ],
        [],
      ),
    ).toMatchObject({
      ignoresCover: true,
      precision: true,
      indirectFire: true,
      rapidFire: 'D3',
      blast: 1,
      cleave: 2,
      melta: 4,
    });
    expect(readKeywords(['Sustained Hits D3', 'Blast 3'], [])).toMatchObject({
      sustainedHits: 'D3',
      blast: 3,
    });
  });

  it('leaves out names that change no numbers', () => {
    expect(readKeywords(['Hazardous', 'Pistol', 'ONE SHOT', 'Assault', 'Overcharge'], [])).toEqual(
      NO_KEYWORDS,
    );
  });

  it('applies conditional keywords only to targets that qualify', () => {
    const lethal = ['LETHAL HITS: non-MONSTER/VEHICLE'];
    expect(readKeywords(lethal, ['INFANTRY']).lethalHits).toBe(true);
    expect(readKeywords(lethal, ['VEHICLE', 'WALKER']).lethalHits).toBe(false);
    const sustained = ['SUSTAINED HITS 2: MONSTER/VEHICLE'];
    expect(readKeywords(sustained, ['MONSTER']).sustainedHits).toBe('2');
    expect(readKeywords(sustained, ['INFANTRY']).sustainedHits).toBeNull();
  });

  it('reads Anti, with two keywords or a non- form', () => {
    expect(readKeywords(['Anti‑infantry 4+'], []).anti).toEqual([
      { keyword: 'INFANTRY', value: 4 },
    ]);
    expect(readKeywords(['ANTI-MONSTER/VEHICLE 3+'], []).anti).toEqual([
      { keyword: 'MONSTER', value: 3 },
      { keyword: 'VEHICLE', value: 3 },
    ]);
    expect(readKeywords(['ANTI-non-MONSTER/VEHICLE 2+'], ['INFANTRY']).anti).toEqual([
      { keyword: '*', value: 2 },
    ]);
    expect(readKeywords(['ANTI-non-MONSTER/VEHICLE 2+'], ['VEHICLE']).anti).toEqual([]);
  });
});

describe('keywordEffect', () => {
  it('says whether a datasheet keyword applies to this target', () => {
    expect(keywordEffect('Anti-monster 3+', ['MONSTER', 'CHARACTER'])).toBe('applies');
    expect(keywordEffect('Anti-monster 3+', ['INFANTRY'])).toBe('not here');
    expect(keywordEffect('Anti-non-character 4+', ['CHARACTER'])).toBe('not here');
    expect(keywordEffect('Anti-non-character 4+', ['INFANTRY'])).toBe('applies');
    expect(keywordEffect('LETHAL HITS: non-MONSTER/VEHICLE', ['VEHICLE'])).toBe('not here');
    expect(keywordEffect('LETHAL HITS: non-MONSTER/VEHICLE', ['INFANTRY'])).toBe('applies');
    expect(keywordEffect('Sustained Hits 1', [])).toBe('applies');
  });

  it('gives nothing for names that change no numbers', () => {
    expect(keywordEffect('Hazardous', ['INFANTRY'])).toBeNull();
    expect(keywordEffect('Pistol', [])).toBeNull();
  });
});

describe('keywordFields', () => {
  const names = [
    'Sustained Hits 1',
    'Twin-linked',
    'Anti-monster 3+',
    'Anti-vehicle 3+',
    'LETHAL HITS: non-MONSTER/VEHICLE',
    'Anti-non-character 4+',
    'Hazardous',
  ];

  it('reads the keywords that hold whatever the target, for the weapon’s own boxes', () => {
    expect(keywordFields(names)).toMatchObject({
      sustainedHits: '1',
      twinLinked: true,
      lethalHits: false,
      anti: [
        { keyword: 'MONSTER', value: 3 },
        { keyword: 'VEHICLE', value: 3 },
      ],
    });
  });

  it('leaves out the ones that depend on the target', () => {
    expect(names.filter(isConditional)).toEqual([
      'LETHAL HITS: non-MONSTER/VEHICLE',
      'Anti-non-character 4+',
    ]);
  });
});
