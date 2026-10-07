import { describe, expect, it } from 'vitest';
import type { UnitData, UnitDatasheet } from './data';
import { matchList } from './list-match';
import { readListUnits } from './list-reader';

const sheet = (
  over: Partial<UnitDatasheet> & Pick<UnitDatasheet, 'id' | 'name'>,
): UnitDatasheet => ({
  legends: false,
  factions: ['Space Marines (Astartes)'],
  keywords: [],
  models: [{ id: `${over.id}-m`, name: over.name, toughness: 4, save: 3, invuln: null, wounds: 2 }],
  sizes: [],
  loadout: [],
  weapons: [],
  wargear: [],
  fnp: null,
  stealth: false,
  damaged: null,
  damageReduction: null,
  abilities: [],
  leads: [],
  supports: [],
  ...over,
});
const weapon = (id: string, name: string) => ({ id, name, profiles: [] });

const data: UnitData = {
  factions: [
    { name: 'Adeptus Astartes', faction: 'Space Marines (Astartes)', parent: null },
    { name: 'Imperial Agents', faction: 'Imperial Agents', parent: null },
  ],
  datasheets: [
    sheet({
      id: 'int',
      name: 'Intercessor Squad',
      models: [
        { id: 'sgt', name: 'Intercessor Sergeant', toughness: 4, save: 3, invuln: null, wounds: 2 },
        { id: 'int-m', name: 'Intercessor', toughness: 4, save: 3, invuln: null, wounds: 2 },
      ],
      sizes: [
        {
          points: 80,
          models: [
            { modelId: 'sgt', count: 1 },
            { modelId: 'int-m', count: 4 },
          ],
        },
      ],
      weapons: [weapon('br', 'Bolt rifle'), weapon('pf', 'Power fist')],
      wargear: ['Auspex'],
    }),
    sheet({
      id: 'cap',
      name: 'Captain',
      weapons: [weapon('rb', 'Relic blade'), weapon('mbp', 'Master-crafted bolt pistol')],
    }),
    sheet({ id: 'cap-old', name: 'Captain', legends: true }),
    sheet({ id: 'kharn', name: 'Khârn the Betrayer', factions: ['Space Marines (Astartes)'] }),
    sheet({ id: 'cv', name: 'Callidus Assassin', factions: ['Imperial Agents'] }),
  ],
};

describe('matchList', () => {
  it('matches units, model kinds and weapons, summing a weapon over model kinds', () => {
    const list = matchList(
      {
        army: 'Space Marines (Astartes)',
        units: [
          {
            name: 'Intercessor Squad',
            points: 80,
            attachedTo: null,
            groups: [
              {
                name: 'Intercessor Sergeant',
                count: 1,
                wargear: [
                  { name: 'Bolt rifle', count: 1 },
                  { name: 'Power fist', count: 1 },
                  { name: 'Auspex', count: 1 },
                ],
              },
              {
                name: 'Intercessor',
                count: 4,
                wargear: [
                  { name: 'Bolt rifle', count: 4 },
                  { name: 'Twin dakkagun', count: 4 },
                ],
              },
            ],
          },
        ],
      },
      data,
    );
    expect(list.units[0]).toEqual({
      label: 'Intercessor Squad ×5',
      name: 'Intercessor Squad',
      datasheetId: 'int',
      attachedTo: null,
      groups: [
        {
          modelId: 'sgt',
          models: 1,
          weapons: [
            { weaponId: 'br', count: 1 },
            { weaponId: 'pf', count: 1 },
          ],
        },
        { modelId: 'int-m', models: 4, weapons: [{ weaponId: 'br', count: 4 }] },
      ],
      unread: ['Twin dakkagun'],
    });
    expect(list.datasheets.map((d) => d.id)).toEqual(['int']);
  });

  it('prefers current datasheets over Legends, forgives accents and typos within the army, and finds allies', () => {
    const list = matchList(
      {
        army: 'Space Marines (Astartes)',
        units: [
          {
            name: 'Captain',
            points: 80,
            attachedTo: null,
            groups: [{ name: null, count: 1, wargear: [{ name: 'Relic Blade', count: 1 }] }],
          },
          { name: 'Kharn the Betrayer', points: 115, attachedTo: null, groups: [] },
          { name: 'Callidus Assassin', points: 100, attachedTo: null, groups: [] },
          { name: 'Made Up Unit', points: 50, attachedTo: null, groups: [] },
        ],
      },
      data,
    );
    expect(list.units.map((u) => u.datasheetId)).toEqual(['cap', 'kharn', 'cv', null]);
    expect(list.units[0]?.groups).toEqual([
      { modelId: 'cap-m', models: 1, weapons: [{ weaponId: 'rb', count: 1 }] },
    ]);
    expect(list.units[3]?.unread).toEqual(['Made Up Unit']);
  });

  it('gives an unnamed group of several kinds the counts of the size with that total', () => {
    const list = matchList(
      {
        army: null,
        units: [
          {
            name: 'Intercessor Squad',
            points: 80,
            attachedTo: null,
            groups: [{ name: null, count: 5, wargear: [{ name: 'Bolt rifle', count: 5 }] }],
          },
        ],
      },
      data,
    );
    expect(list.units[0]?.groups).toEqual([
      { modelId: 'sgt', models: 1, weapons: [] },
      { modelId: 'int-m', models: 4, weapons: [{ weaponId: 'br', count: 5 }] },
    ]);
  });

  it('turns a wargear name that is a model kind into models of that kind, within the unit’s count', () => {
    const list = matchList(
      readListUnits(
        `+ FACTION KEYWORD: Imperium - Space Marines\n\n5x Intercessor Squad (80 pts): Intercessor Sergeant, 4 with Bolt rifle\n`,
      ),
      data,
    );
    expect(list.units[0]?.groups).toEqual([
      { modelId: 'int-m', models: 4, weapons: [{ weaponId: 'br', count: 4 }] },
      { modelId: 'sgt', models: 1, weapons: [] },
    ]);
  });

  it('never counts a unit-level wargear line as a model', () => {
    const list = matchList(
      readListUnits(`T (2000 points)

Space Marines
Gladius Task Force (3 Detachment Points)
Take and Hold
Strike Force (2000 points)

Intercessor Squad (80 points)
  • 1x Auspex
  • 1x Power fist
  • 1x Intercessor Sergeant
    • 1x Bolt rifle
  • 4x Intercessor
    • 4x Bolt rifle
`),
      data,
    );
    const groups = list.units[0]?.groups ?? [];
    expect(groups.reduce((sum, g) => sum + g.models, 0)).toBe(5);
    expect(groups.flatMap((g) => g.weapons)).toEqual([
      { weaponId: 'pf', count: 1 },
      { weaponId: 'br', count: 1 },
      { weaponId: 'br', count: 4 },
    ]);
  });

  it('matches renamed weapons: one weapon containing the name, or a datasheet’s only melee weapon', () => {
    const melee = {
      name: 'x',
      melee: true,
      range: null,
      attacks: '1',
      skill: 3,
      strength: 4,
      ap: 0,
      damage: '1',
      keywords: [],
    };
    const scouts: UnitData = {
      factions: data.factions,
      datasheets: [
        sheet({
          id: 'sc',
          name: 'Scout Squad',
          weapons: [
            { id: 'cs', name: 'Chainsword', profiles: [melee] },
            { id: 'ck', name: 'Combat Knife', profiles: [melee] },
            { id: 'bg', name: 'Boltgun', profiles: [] },
          ],
        }),
        sheet({
          id: 'ls',
          name: 'Land Speeder',
          weapons: [
            { id: 'hb', name: 'Heavy Bolter', profiles: [] },
            { id: 'ah', name: 'Armoured Hull', profiles: [melee] },
          ],
        }),
      ],
    };
    const list = matchList(
      {
        army: null,
        units: [
          {
            name: 'Scout Squad',
            points: 70,
            attachedTo: null,
            groups: [
              {
                name: null,
                count: 5,
                wargear: [
                  { name: 'Astartes chainsword', count: 1 },
                  { name: 'Close combat weapon', count: 4 },
                ],
              },
            ],
          },
          {
            name: 'Land Speeder',
            points: 70,
            attachedTo: null,
            groups: [
              { name: null, count: 1, wargear: [{ name: 'Close combat weapon', count: 1 }] },
            ],
          },
        ],
      },
      scouts,
    );
    // The scouts have two melee weapons, so "Close combat weapon" stays unread there.
    expect(list.units[0]?.groups[0]?.weapons).toEqual([{ weaponId: 'cs', count: 1 }]);
    expect(list.units[0]?.unread).toEqual(['Close combat weapon']);
    expect(list.units[1]?.groups[0]?.weapons).toEqual([{ weaponId: 'ah', count: 1 }]);
    expect(list.units[1]?.unread).toEqual([]);
  });
});
