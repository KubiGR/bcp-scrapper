import { describe, expect, it } from 'vitest';
import {
  cleanDetachmentName,
  detachmentParts,
  parseArmyList,
  splitDetachments,
  type ParsedList,
} from './army-list-parser';

const GW_EN = `Night Shift (1995 points)

Thousand Sons
Grand Coven (3 Detachment Points)
Priority Assets
Strike Force (2000 points)

Attached Units
Exalted Sorcerer (110 points)`;

const GW_SUBARMY = `Blue Boys (2,000 Points)

Space Marines
Ultramarines
Blade of Ultramar (3 Detachment Points)
Take and Hold
Strike Force (2,000 Points)`;

const GW_NO_TITLE_POINTS = `Anna Example

Adeptus Custodes
Lions of the Emperor (3 Detachment Points)
Take and Hold
Strike Force (2000 points)`;

const GW_PREAMBLE = `NOTE: trike attached to bikes

Speedy Bois (1995 points)

Orks
Flyboyz, Kult of Speed and Wreckas (3 Detachment Points)
Reconnaissance
Strike Force (2000 points)`;

const GW_ES = `La probada 2.0  (2000 puntos)

Legiones Daemónicas
Blood Legion y Cabalgata del Caos (3 puntos de destacamento)
Purgar al enemigo
Fuerza de Choque (2000 Points)`;

const HEADER = `+++++++++++++++++++++++++++
+ PLAYER NAME: Some Body
+ FACTION KEYWORD: Imperium - Grey Knights
+ DETACHMENT: Warpbane Task Force, Brotherhood Strike (Hallowed Ground)
+ FORCE DISPOSITION: Take and Hold
+ TOTAL ARMY POINTS: 2000pts
+++++++++++++++++++++++++++`;

const TEMPLATE = `Name: Some Body
Team: Example Team

Factions used:
Chaos Space Marines

Detachments used: Renegade Raiders

Disposition: Reconnaissance`;

const TEMPLATE_THEN_GW = `Name: Some Body

Factions used:
Chaos Space Marines,
Chaos Daemons

Detachments used: Renegade Raiders

Loud Noises (2.000 Points)

Emperor's Children
Carnival of Excess (3 Detachment Points)
Purge the Foe
Strike Force (2.000 Points)`;

const FREE = `Space Marines – Gladius Task Force

Captain (80 pts)
Intercessor Squad x10 (160 pts)`;

const UNITS_ONLY = `Mek + 6x Tankbustas (190 pts)
  Mek (45 pts)
  6x Tankbustas (145 pts) - 2x Rokkit Pistol

Attached Units:
Lord (80 pts)
  10x Gretchin (45 pts)
  Big Mek (1000 pts)`;

const ONE_LINE = `Cursed Crons - Necrons - Purge the Foe - Cursed Legion, Skyshroud Spearhead (1995 Points)


Attached Units:
Lokhust Lord (80 pts)`;

const ONE_LINE_NO_NAME = ` - Chaos Space Marines - Take and Hold - Fellhammer Siege-host (2000 Points)`;

const GW_CHAPTER = `Angels (1995 points)

Space Marines
Dark Angels
Wrath of the Rock (3 Detachment Points)
Priority Assets
Strike Force (2000 points)`;

const GW_CURLY = `EC (2000 points)

Emperor’s Children
Carnival of Excess (3 Detachment Points)
Purge the Foe
Strike Force (2000 points)`;

const unknown: ParsedList = { army: null, detachments: [], disposition: null, format: 'unknown' };

describe('parseArmyList', () => {
  const cases: [string, string | null, ParsedList][] = [
    [
      'GW app (English)',
      GW_EN,
      {
        army: 'Thousand Sons',
        detachments: ['Grand Coven'],
        disposition: 'Priority Assets',
        format: 'gw-app',
      },
    ],
    [
      'GW app with a sub-army line',
      GW_SUBARMY,
      {
        army: 'Space Marines (Astartes)',
        detachments: ['Blade of Ultramar'],
        disposition: 'Take and Hold',
        format: 'gw-app',
      },
    ],
    [
      'GW app whose title has no points',
      GW_NO_TITLE_POINTS,
      {
        army: 'Adeptus Custodes',
        detachments: ['Lions of the Emperor'],
        disposition: 'Take and Hold',
        format: 'gw-app',
      },
    ],
    [
      'GW app after a note, several detachments',
      GW_PREAMBLE,
      {
        army: 'Orks',
        detachments: ['Flyboyz, Kult of Speed and Wreckas'],
        disposition: 'Reconnaissance',
        format: 'gw-app',
      },
    ],
    [
      'GW app in Spanish',
      GW_ES,
      {
        army: 'Chaos Daemons',
        detachments: ['Blood Legion y Cabalgata del Caos'],
        disposition: null,
        format: 'gw-app',
      },
    ],
    [
      'header format',
      HEADER,
      {
        army: 'Grey Knights',
        detachments: ['Warpbane Task Force', 'Brotherhood Strike'],
        disposition: 'Take and Hold',
        format: 'header',
      },
    ],
    [
      'template format',
      TEMPLATE,
      {
        army: 'Chaos Space Marines',
        detachments: ['Renegade Raiders'],
        disposition: 'Reconnaissance',
        format: 'template',
      },
    ],
    [
      'template followed by a GW app block',
      TEMPLATE_THEN_GW,
      {
        army: "Emperor's Children",
        detachments: ['Carnival of Excess'],
        disposition: 'Purge the Foe',
        format: 'gw-app',
      },
    ],
    ['free text (a unit line is not a detachment line)', FREE, unknown],
    [
      'a title line that is no army leaves the army unknown',
      `*** Big quote ***

Not An Army
Grand Coven (3 Detachment Points)
Priority Assets
Strike Force (2000 points)`,
      {
        army: null,
        detachments: ['Grand Coven'],
        disposition: 'Priority Assets',
        format: 'gw-app',
      },
    ],
    ['units only (small points values are not a battle size)', UNITS_ONLY, unknown],
    [
      'one-line header: name - army - disposition - detachments',
      ONE_LINE,
      {
        army: 'Necrons',
        detachments: ['Cursed Legion', 'Skyshroud Spearhead'],
        disposition: 'Purge the Foe',
        format: 'header',
      },
    ],
    [
      'one-line header without a name',
      ONE_LINE_NO_NAME,
      {
        army: 'Chaos Space Marines',
        detachments: ['Fellhammer Siege-host'],
        disposition: 'Take and Hold',
        format: 'header',
      },
    ],
    [
      'GW app with a chapter BCP lists as its own faction',
      GW_CHAPTER,
      {
        army: 'Dark Angels',
        detachments: ['Wrath of the Rock'],
        disposition: 'Priority Assets',
        format: 'gw-app',
      },
    ],
    [
      'curly apostrophes become straight ones',
      GW_CURLY,
      {
        army: "Emperor's Children",
        detachments: ['Carnival of Excess'],
        disposition: 'Purge the Foe',
        format: 'gw-app',
      },
    ],
    ['empty text', '', unknown],
    ['no text', null, unknown],
  ];
  it.each(cases)('%s', (_name, text, expected) => {
    expect(parseArmyList(text)).toEqual(expected);
  });

  it('takes the faction line as the army when a title without points sits right above it', () => {
    const text = `Anna's Custodes
Adeptus Custodes
Lions of the Emperor (3 Detachment Points)
Take and Hold
Strike Force (2000 points)`;
    expect(parseArmyList(text)).toMatchObject({
      army: 'Adeptus Custodes',
      detachments: ['Lions of the Emperor'],
      format: 'gw-app',
    });
  });

  it('never takes a "(2 CP)" line for the detachment', () => {
    const text = `Orks
Waaagh Stratagem (2 CP)
Strike Force (2000 points)`;
    expect(parseArmyList(text).format).not.toBe('gw-app');
  });

  it('drops nested brackets after each detachment in a header line', () => {
    const text = `+ FACTION KEYWORD: Xenos - Orks
+ DETACHMENT: War Horde (Enhancements: Follow Me Ladz (+25 pts)), Kult of Speed (x)`;
    expect(parseArmyList(text).detachments).toEqual(['War Horde', 'Kult of Speed']);
  });

  it('reads a header line that has the disposition after the detachment', () => {
    const text = `+ FACTION KEYWORD: Xenos - Necrons
+ DETACHMENT: Awakened Dynasty + FORCE DISPOSITION: TAKE AND HOLD`;
    expect(parseArmyList(text)).toMatchObject({
      detachments: ['Awakened Dynasty'],
      disposition: 'Take and Hold',
    });
  });

  it('straightens curly apostrophes in a template list', () => {
    const text = `Factions used: Emperor’s Children
Detachment: Carnival of Excess`;
    expect(parseArmyList(text)).toMatchObject({
      army: "Emperor's Children",
      detachments: ['Carnival of Excess'],
    });
  });

  it('reads Windows line endings', () => {
    expect(parseArmyList(GW_EN.replace(/\n/g, '\r\n')).army).toBe('Thousand Sons');
  });

  it('reads a GW app export with several detachments and "Force Disposition:"', () => {
    const text = [
      'My list (copy 2) (2000 points)',
      '',
      'Space Marines',
      'Deathwatch Support (1 Detachment Point)',
      'Terminator Storm Force (1 Detachment Point)',
      'Assault Brethren (1 Detachment Point)',
      'Strike Force (2000 points)',
      'Force Disposition: Disruption',
      '',
      'ATTACHED UNITS',
      '',
      'Attached unit 1',
      'Cato Sicarius (115 points)',
    ].join('\n');
    expect(parseArmyList(text)).toEqual({
      army: 'Space Marines (Astartes)',
      detachments: ['Deathwatch Support', 'Terminator Storm Force', 'Assault Brethren'],
      disposition: 'Disruption',
      format: 'gw-app',
    });
  });

  it('reads a +++ template whose detachment is a "(3 Detachment Points)" line with the disposition under it', () => {
    const text = [
      '++++++++++++++++++++++++++++++++++++++++',
      'Player Name: SOMEONE',
      'Team Name: Some Team',
      'Factions Used: Death Guard',
      'Army Points: 2000',
      'Army Enhancements: Tendrilous Emissions on Lord of Virulence',
      'Detachment Rule: Miasmic Bombardment & Warped and Rusted Animus',
      'Death Guard',
      'Contagion Engines and Mortarion’s Hammer (3 Detachment Points)',
      'Reconnaissance',
      '++++++++++++++++++++++++++++++++++++++++',
      '',
      'Attached Units',
    ].join('\n');
    expect(parseArmyList(text)).toEqual({
      army: 'Death Guard',
      detachments: ["Contagion Engines and Mortarion's Hammer"],
      disposition: 'Reconnaissance',
      format: 'template',
    });
  });

  it('reads battle sizes written with a space for thousands, "(2 000 Points)"', () => {
    const text = [
      'WE berzerker and butchers (2 000 Points)',
      '',
      'World Eaters',
      'Berzerker Warband and Butchers of Khorne (3 Detachment Points)',
      'Take and Hold',
      'Strike Force (2 000 Points)',
    ].join('\n');
    expect(parseArmyList(text)).toMatchObject({
      army: 'World Eaters',
      detachments: ['Berzerker Warband and Butchers of Khorne'],
      disposition: 'Take and Hold',
    });
  });

  it('reads "Detachment:" and "Disposition:" fields without a "Factions used:" line', () => {
    const text = [
      'BTC - Cursed Legion',
      'Warhammer 40,000 · Necrons',
      '2000 / 2000 pts',
      'Detachment: Cursed Legion, Skyshroud Spearhead',
      'Disposition: Purge the Foe',
      'Warlord: Imotekh the Stormlord',
    ].join('\n');
    expect(parseArmyList(text)).toEqual({
      army: 'Necrons',
      detachments: ['Cursed Legion', 'Skyshroud Spearhead'],
      disposition: 'Purge the Foe',
      format: 'template',
    });
  });
});

describe('splitDetachments', () => {
  it('splits a joined name when every part is a known detachment', () => {
    const known = new Set(['Flyboyz', 'Kult of Speed', 'Wreckas']);
    expect(splitDetachments(['Flyboyz, Kult of Speed and Wreckas'], known)).toEqual([
      'Flyboyz',
      'Kult of Speed',
      'Wreckas',
    ]);
    expect(splitDetachments(['A y B'], new Set(['A', 'B']))).toEqual(['A', 'B']);
  });

  it('splits on "&" and "+" like on "and"', () => {
    const known = new Set(['Cursed Legion', 'Skyshroud Spearhead', 'Awakened Dynasty']);
    expect(splitDetachments(['Cursed Legion & Skyshroud Spearhead'], known)).toEqual([
      'Cursed Legion',
      'Skyshroud Spearhead',
    ]);
    expect(splitDetachments(['Awakened Dynasty + Cursed Legion'], known)).toEqual([
      'Awakened Dynasty',
      'Cursed Legion',
    ]);
    // Only where that gives known names.
    expect(splitDetachments(['Salt & Iron'], known)).toEqual(['Salt & Iron']);
  });

  it('splits when at least one part is a known detachment', () => {
    // 11th-edition GW-app lines join several detachments; "Shield Host" is never taken alone.
    expect(
      splitDetachments(['Shield Host and Tharanatoi Hammerblow'], new Set(['Shield Host'])),
    ).toEqual(['Shield Host', 'Tharanatoi Hammerblow']);
    expect(
      splitDetachments(['Houndpack Lance and Hunting Warpack'], new Set(['Houndpack Lance'])),
    ).toEqual(['Houndpack Lance', 'Hunting Warpack']);
  });

  it('keeps the name when no part is known (a single name may contain "and")', () => {
    expect(splitDetachments(['Blood and Iron'], new Set())).toEqual(['Blood and Iron']);
  });

  it('keeps a name that contains "and" whole when that gives more known names', () => {
    expect(
      splitDetachments(
        ['Legends of Saga and Song and Saga of the Great Wolf'],
        new Set(['Saga of the Great Wolf']),
      ),
    ).toEqual(['Legends of Saga and Song', 'Saga of the Great Wolf']);
  });

  it('always splits on commas, including a comma before the last "and"', () => {
    expect(splitDetachments(['Blitz Brigade, Dread Mob, and Wreckas'], new Set())).toEqual([
      'Blitz Brigade',
      'Dread Mob',
      'Wreckas',
    ]);
    expect(splitDetachments(['Shield Host, Tharanatoi Hammerblow'], new Set())).toEqual([
      'Shield Host',
      'Tharanatoi Hammerblow',
    ]);
  });

  it('compares known names ignoring case', () => {
    expect(splitDetachments(['shield host and Moritoi'], new Set(['Shield Host']))).toEqual([
      'shield host',
      'Moritoi',
    ]);
  });

  it('leaves lists that are already split, or empty', () => {
    expect(splitDetachments(['A', 'B'], new Set(['A', 'B']))).toEqual(['A', 'B']);
    expect(splitDetachments([], new Set())).toEqual([]);
  });
});

describe('cleanDetachmentName', () => {
  it('collapses every kind of space and straightens apostrophes', () => {
    expect(cleanDetachmentName('Lions\u00a0of the  Emperor ')).toBe('Lions of the Emperor');
    expect(cleanDetachmentName('Emperor’s Wrath')).toBe("Emperor's Wrath");
  });

  it('repairs a garbled non-breaking space and straightens non-breaking hyphens', () => {
    // UTF-8's non-breaking space read as Latin-1 somewhere before BCP: "Â" + the space.
    expect(cleanDetachmentName('Xenocult\u00c2\u00a0Masses')).toBe('Xenocult Masses');
    expect(cleanDetachmentName('Rad\u2011zone Corps')).toBe('Rad-zone Corps');
    // A real "Â" stays.
    expect(cleanDetachmentName('Needgaârd Oathband')).toBe('Needgaârd Oathband');
  });
});

describe('detachmentParts', () => {
  it('splits a joined line on commas and joining words', () => {
    expect(detachmentParts('Flyboyz, Kult of Speed and Wreckas')).toEqual([
      'Flyboyz',
      'Kult of Speed',
      'Wreckas',
    ]);
    expect(detachmentParts('Grand Coven')).toEqual(['Grand Coven']);
  });
});
