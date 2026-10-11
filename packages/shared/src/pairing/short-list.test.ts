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

  it('reads the count-first style: "5x Unit (260 pts): gear", characters as "Char1: 1x Name"', () => {
    const list = [
      '+ TOTAL ARMY POINTS: 1995pts',
      '',
      "Char1: 1x Trajann Valoris (135 pts): Warlord, Eagle's Scream, Watcher's Axe",
      '',
      'Char2: 1x Valerian (120 pts): Gnosis',
      'Leading Custodian Wardens',
      '5x Custodian Wardens (260 pts)',
      '• 4x Custodian Warden (Guardian Spear): 4 with Guardian Spear',
      '• 1x Custodian Warden: Vexilla, Guardian Spear',
      '  Attached to Valerian',
      '',
      '6x Allarus Custodians (360 pts): 6 with Balistus grenade launcher, Guardian Spear',
      '6x Allarus Custodians (360 pts): 6 with Balistus grenade launcher, Guardian Spear',
      '',
      '4x Prosecutors (50 pts)',
      '• 1x Prosecutor Sister Superior: Boltgun, Close combat weapon',
      '• 3x Prosecutor: 3 with Boltgun, Close combat weapon',
      '4x Witchseekers (50 pts)',
      '• 1x Witchseeker Sister Superior: Close combat weapon, Witchseeker flamer',
      '• 3x Witchseeker: 3 with Close combat weapon, Witchseeker flamer',
      '4x Witchseekers (50 pts)',
      '• 1x Witchseeker Sister Superior: Close combat weapon, Witchseeker flamer',
      '• 3x Witchseeker: 3 with Close combat weapon, Witchseeker flamer',
    ].join('\n');
    expect(shortList(list)).toEqual([
      'Trajann Valoris',
      'Valerian',
      '5 Custodian Wardens',
      '2x6 Allarus Custodians',
      '4 Prosecutors',
      '2x4 Witchseekers',
    ]);
  });

  it('counts only models (lines with their own gear), not icons or "Attached as"', () => {
    const list = [
      'Khorne Berzerkers (170 Points)',
      '  • Attached as: Bodyguard (Battleline)',
      '  • 1x Khorne Berzerker Champion',
      '     ◦ 1x Chainblade',
      '  • 9x Khorne Berzerker',
      '     ◦ 7x Bolt pistol',
      '  • 1x Icon of Khorne',
      '',
      'Exalted Eightbound (130 Points)',
      '  • Attached as: Bodyguard',
      '  • 1x Exalted Eightbound Champion',
      '     ◦ 1x Chainblades',
      '  • 2x Exalted Eightbound',
      '     ◦ 2x Chainblades',
      '',
      'Jakhals (65 Points)',
      '  • 1x Jakhal Pack Leader',
      '     ◦ 1x Autopistol',
      '  • 1x Dishonoured',
      '     ◦ 1x Skullsmasher and mangler',
      '  • 8x Jakhal',
      '     ◦ 8x Autopistol',
      '  • 1x Icon of Khorne',
    ].join('\n');
    expect(shortList(list)).toEqual(['10 Khorne Berzerkers', '3 Exalted Eightbound', '10 Jakhals']);
  });
});
