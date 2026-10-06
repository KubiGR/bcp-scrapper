import { describe, expect, it } from 'vitest';
import { readListUnits } from './list-reader';

const GW = `Golden (2000 points)

Adeptus Custodes
Lions of the Emperor (3 Detachment Points)
Take and Hold
Strike Force (2000 points)

Attached Units
Attached Unit 1

Valerian (110 points)
• Attached as: Leader (Character)
  • Warlord
  • 1x Gnosis

Custodian Wardens (250 points)
• Attached as: Bodyguard
  • 5x Custodian Warden
    • 5x Guardian spear
      1x Vexilla


CHARACTERS

Shield-Captain on Dawneagle Jetbike (165 points)
  • 1x Interceptor lance
    1x Vertus hurricane bolter
  • Enhancement: Praesidius


OTHER DATASHEETS

Prosecutors (45 points)
  • 1x Prosecutor Sister Superior
    • 1x Boltgun
      1x Close combat weapon
  • 3x Prosecutor
    • 3x Boltgun
      3x Close combat weapon

Exported with App Version: v2.6.0 (144), Data Version: v946
`;

const NR = `Look Ma

+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - Necrons
+ DETACHMENT: Cursed Legion
+ TOTAL ARMY POINTS: 2000pts
+++++++++++++++++++++++++++++++++++++++++++++++

Char5: 1x Lokhust Lord (100 pts): Resurrection orb, Lord's blade
Leading Lokhust Destroyers
Char6: 1x Skorpekh Lord (95 pts): Enmitic annihilator, Flensing claw, Hyperphase harvester
Leading Skorpekh Destroyers[1]
Char7: 1x Skorpekh Lord (95 pts): Enmitic annihilator, Flensing claw, Hyperphase harvester
Leading Skorpekh Destroyers[2]

5x Immortals (70 pts): 5 with Close combat weapon, Tesla carbine
6x Lokhust Destroyers (175 pts): 6 with Close combat weapon, Gauss cannon
  Attached to Lokhust Lord
3x Ophydian Destroyers (80 pts): Plasmacyte, 3 with Ophydian hyperphase weapons
3x Skorpekh Destroyers (85 pts): Plasmacyte, 3 with Skorpekh hyperphase weapons
  Attached to Skorpekh Lord[1]
3x Skorpekh Destroyers (85 pts): Plasmacyte, 3 with Skorpekh hyperphase weapons
  Attached to Skorpekh Lord[2]

Created with newrecruit.eu v35.70
`;

const NR_LINES = `+ FACTION KEYWORD: Chaos - World Eaters
+ DETACHMENT: Berzerker Warband

Char2: 1x Khârn the Betrayer (115 pts): Gorechild, Plasma pistol
Leading Khorne Berzerkers

10x Khorne Berzerkers (160 pts)
• 9x Khorne Berzerker
    5 with Bolt pistol, Chainblade
    2 with Chainblade, Plasma pistol
    2 with Bolt pistol, Khornate eviscerator
• 1x Khorne Berzerker Champion: Icon of Khorne, Chainblade, Plasma pistol
  Attached to Khârn the Betrayer
`;

describe('readListUnits: GW app', () => {
  const read = readListUnits(GW);
  const unit = (name: string) => read.units.find((u) => u.name === name);

  it('reads the army and every unit with its points, title and size lines left out', () => {
    expect(read.army).toBe('Adeptus Custodes');
    expect(read.units.map((u) => [u.name, u.points])).toEqual([
      ['Valerian', 110],
      ['Custodian Wardens', 250],
      ['Shield-Captain on Dawneagle Jetbike', 165],
      ['Prosecutors', 45],
    ]);
  });

  it('reads model lines with their wargear, and a single model’s wargear unnamed', () => {
    expect(unit('Custodian Wardens')?.groups).toEqual([
      {
        name: 'Custodian Warden',
        count: 5,
        wargear: [
          { name: 'Guardian spear', count: 5 },
          { name: 'Vexilla', count: 1 },
        ],
      },
    ]);
    expect(unit('Shield-Captain on Dawneagle Jetbike')?.groups).toEqual([
      {
        name: null,
        count: 1,
        wargear: [
          { name: 'Interceptor lance', count: 1 },
          { name: 'Vertus hurricane bolter', count: 1 },
        ],
      },
    ]);
    expect(unit('Prosecutors')?.groups.map((g) => [g.name, g.count])).toEqual([
      ['Prosecutor Sister Superior', 1],
      ['Prosecutor', 3],
    ]);
  });

  it('attaches leaders and support to their bodyguard', () => {
    expect(unit('Valerian')?.attachedTo).toBe(1);
    expect(unit('Valerian')?.groups).toEqual([
      { name: null, count: 1, wargear: [{ name: 'Gnosis', count: 1 }] },
    ]);
    expect(unit('Custodian Wardens')?.attachedTo).toBeNull();
    expect(unit('Prosecutors')?.attachedTo).toBeNull();
  });
});

describe('readListUnits: NewRecruit', () => {
  it('reads one-line units: counts, "N with" groups, loose items, and attachments by index', () => {
    const read = readListUnits(NR);
    expect(read.army).toBe('Necrons');
    expect(read.units.map((u) => [u.name, u.points, u.attachedTo])).toEqual([
      ['Lokhust Lord', 100, 4],
      ['Skorpekh Lord', 95, 6],
      ['Skorpekh Lord', 95, 7],
      ['Immortals', 70, null],
      ['Lokhust Destroyers', 175, null],
      ['Ophydian Destroyers', 80, null],
      ['Skorpekh Destroyers', 85, null],
      ['Skorpekh Destroyers', 85, null],
    ]);
    expect(read.units[3]?.groups).toEqual([
      {
        name: null,
        count: 5,
        wargear: [
          { name: 'Close combat weapon', count: 5 },
          { name: 'Tesla carbine', count: 5 },
        ],
      },
    ]);
    expect(read.units[5]?.groups).toEqual([
      {
        name: null,
        count: 3,
        wargear: [
          { name: 'Plasmacyte', count: 1 },
          { name: 'Ophydian hyperphase weapons', count: 3 },
        ],
      },
    ]);
    expect(read.units[0]?.groups[0]?.wargear.map((w) => w.name)).toEqual([
      'Resurrection orb',
      "Lord's blade",
    ]);
  });

  it('reads model lines with "N with" sub-lines, adding up each weapon', () => {
    const read = readListUnits(NR_LINES);
    expect(read.army).toBe('World Eaters');
    expect(read.units[0]).toMatchObject({ name: 'Khârn the Betrayer', attachedTo: 1 });
    expect(read.units[1]?.groups).toEqual([
      {
        name: 'Khorne Berzerker',
        count: 9,
        wargear: [
          { name: 'Bolt pistol', count: 7 },
          { name: 'Chainblade', count: 7 },
          { name: 'Plasma pistol', count: 2 },
          { name: 'Khornate eviscerator', count: 2 },
        ],
      },
      {
        name: 'Khorne Berzerker Champion',
        count: 1,
        wargear: [
          { name: 'Icon of Khorne', count: 1 },
          { name: 'Chainblade', count: 1 },
          { name: 'Plasma pistol', count: 1 },
        ],
      },
    ]);
  });
});

const NR_BLOCKS = `+++++++++++++++++++++++++++++++++++++++++++++++
+ FACTION KEYWORD: Xenos - T'au Empire
+ DETACHMENT: Retaliation Cadre (Bonded Heroes)
+ TOTAL ARMY POINTS: 2000pts
+++++++++++++++++++++++++++++++++++++++++++++++

Attached Units
Attached Unit 1

Commander Farsight (70 pts)
• Attached as: Leader (Character)
• 1x Dawn Blade
• 1x High-intensity plasma rifle

Crisis Fireknife Battlesuits (130 pts)
• Attached as: Bodyguard
• 1x Crisis Fireknife Shas’vre
    • 2x Missile pod
    • 1x Battlesuit fists
    • Marker Drone, Shield Drone
• 2x Crisis Fireknife Shas’ui
    • 2x Battlesuit fists
    • 4x Missile pod

CHARACTER

Mortarion (375 pts)
• 1x Lantern
• Warlord
`;

describe('readListUnits: NewRecruit in blocks', () => {
  it('reads GW-app-like blocks under a NewRecruit header, bullets at the left edge', () => {
    const read = readListUnits(NR_BLOCKS);
    expect(read.army).toBe("T'au Empire");
    expect(read.units.map((u) => [u.name, u.points, u.attachedTo])).toEqual([
      ['Commander Farsight', 70, 1],
      ['Crisis Fireknife Battlesuits', 130, null],
      ['Mortarion', 375, null],
    ]);
    expect(read.units[0]?.groups).toEqual([
      {
        name: null,
        count: 1,
        wargear: [
          { name: 'Dawn Blade', count: 1 },
          { name: 'High-intensity plasma rifle', count: 1 },
        ],
      },
    ]);
    expect(read.units[1]?.groups.map((g) => [g.name, g.count, g.wargear.length])).toEqual([
      ['Crisis Fireknife Shas’vre', 1, 2],
      ['Crisis Fireknife Shas’ui', 2, 2],
    ]);
  });
});

describe('readListUnits: other text', () => {
  it('finds no units in formats it can’t read', () => {
    expect(
      readListUnits('* [L1][W] Commander Farsight [70]\n* 10 Breacher Team [90]').units,
    ).toEqual([]);
    expect(readListUnits('').units).toEqual([]);
  });
});
