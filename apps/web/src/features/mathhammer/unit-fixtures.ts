import type { UnitDatasheet, UnitProfile } from '@bcp/shared';

const profile = (p: Partial<UnitProfile> & Pick<UnitProfile, 'name'>): UnitProfile => ({
  melee: false,
  range: '24"',
  attacks: '2',
  skill: 3,
  strength: 4,
  ap: 0,
  damage: '1',
  keywords: [],
  ...p,
});

const sheet = (s: Partial<UnitDatasheet> & Pick<UnitDatasheet, 'id' | 'name'>): UnitDatasheet => ({
  legends: false,
  factions: ['Space Marines (Astartes)'],
  keywords: ['INFANTRY'],
  models: [],
  sizes: [],
  loadout: [],
  weapons: [],
  fnp: null,
  stealth: false,
  damaged: null,
  abilities: [],
  leads: [],
  supports: [],
  ...s,
});

/** Five or ten Intercessors (one a Sergeant) with bolt rifles; a plasma gun they could take. */
export const INTERCESSORS = sheet({
  id: 'ds-int',
  name: 'Intercessor Squad',
  models: [
    { id: 'm-int', name: 'Intercessor', toughness: 4, save: 3, invuln: null, wounds: 2 },
    { id: 'm-sgt', name: 'Intercessor Sergeant', toughness: 4, save: 3, invuln: null, wounds: 2 },
  ],
  sizes: [
    {
      points: 80,
      models: [
        { modelId: 'm-int', count: 4 },
        { modelId: 'm-sgt', count: 1 },
      ],
    },
    {
      points: 160,
      models: [
        { modelId: 'm-int', count: 9 },
        { modelId: 'm-sgt', count: 1 },
      ],
    },
  ],
  loadout: [
    { modelId: 'm-int', weaponId: 'wi-br', count: 1 },
    { modelId: 'm-sgt', weaponId: 'wi-br', count: 1 },
    { modelId: 'm-sgt', weaponId: 'wi-pi', count: 1 },
  ],
  weapons: [
    {
      id: 'wi-br',
      name: 'Bolt rifle',
      profiles: [profile({ name: 'Bolt rifle', ap: -1, keywords: ['Rapid Fire 1'] })],
    },
    {
      id: 'wi-pi',
      name: 'Plasma gun',
      profiles: [
        profile({ name: 'Standard', strength: 7, ap: -2 }),
        profile({ name: 'Supercharge', strength: 8, ap: -3, damage: '2', keywords: ['Hazardous'] }),
      ],
    },
  ],
});

/** A Captain (a Character with a 4+ invulnerable save) who can lead Intercessors. */
export const CAPTAIN = sheet({
  id: 'ds-cap',
  name: 'Captain',
  keywords: ['CHARACTER', 'INFANTRY'],
  models: [{ id: 'm-cap', name: 'Captain', toughness: 4, save: 3, invuln: 4, wounds: 5 }],
  sizes: [{ points: 80, models: [{ modelId: 'm-cap', count: 1 }] }],
  loadout: [{ modelId: 'm-cap', weaponId: 'wi-mc', count: 1 }],
  weapons: [
    {
      id: 'wi-mc',
      name: 'Master-crafted power weapon',
      profiles: [
        profile({
          name: 'Master-crafted power weapon',
          melee: true,
          range: 'Melee',
          attacks: '5',
          skill: 2,
          strength: 5,
          ap: -2,
          damage: '2',
        }),
      ],
    },
  ],
  fnp: 6,
  leads: ['ds-int'],
});
