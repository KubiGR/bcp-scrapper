import { describe, expect, it } from 'vitest';
import { shortList } from './short-list';

// As the GW app exports a list: title, army, detachment, size, sections, units with bullets.
const GW_APP = [
  "Crowe's Knights (1995 Points)",
  '',
  'Grey Knights',
  'Argent Assault',
  'Strike Force (2,000 Points)',
  '',
  'CHARACTERS',
  '',
  'Castellan Crowe (90 Points)',
  '  • Warlord',
  '  • 1x Black Blade of Antwyr',
  '',
  'Brotherhood Champion (80 Points)',
  '  • 1x Nemesis force sword',
  '',
  'BATTLELINE',
  '',
  'Strike Squad (110 Points)',
  '  • 1x Justicar',
  '     ◦ 1x Nemesis force weapon',
  '  • 4x Grey Knight',
  '     ◦ 4x Storm bolter',
  '',
  'Strike Squad (110 Points)',
  '  • 1x Justicar',
  '  • 4x Grey Knight',
  '     ◦ 4x Storm bolter',
  '',
  'OTHER DATASHEETS',
  '',
  'Purifier Squad (240 Points)',
  '  • 1x Knight of the Flame',
  '     ◦ 1x Nemesis force weapon',
  '  • 9x Purifier',
  '     ◦ 9x Storm bolter',
  '',
  'Nemesis Dreadknight (215 Points)',
  '  • 1x Nemesis greatsword',
  '',
  'Nemesis Dreadknight (215 Points)',
  '  • 1x Nemesis greatsword',
  '',
  'Exported with App Version: v1.40.0 (1), Data Version: v637',
].join('\n');

describe('shortList', () => {
  it('lists each unit once with its models, merging repeats, from a GW app export', () => {
    expect(shortList(GW_APP)).toEqual([
      'Castellan Crowe',
      'Brotherhood Champion',
      '2x5 Strike Squad',
      '10 Purifier Squad',
      '2x Nemesis Dreadknight',
    ]);
  });

  it('reads the "Unit xN (points)" style too', () => {
    expect(
      shortList('Orks – Kult of Speed\n\nWarboss on Warbike (80 pts)\nWarbikers x6 (140 pts)'),
    ).toEqual(['Warboss on Warbike', '6 Warbikers']);
  });

  it('nothing readable, nothing listed', () => {
    expect(shortList(null)).toEqual([]);
    expect(shortList('just some notes about my army')).toEqual([]);
  });
});
