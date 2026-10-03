import { describe, expect, it } from 'vitest';
import { parseBsdataCatalogues } from './bsdata';

const entry = (name: string, modifiers?: unknown[]) => ({ name, id: `e-${name}`, modifiers });
const hiddenUnless = (catalogueId: string) => ({
  field: 'hidden',
  type: 'set',
  value: true,
  conditions: [{ childId: catalogueId, scope: 'primary-catalogue', type: 'notInstanceOf' }],
});
const hiddenFor = (catalogueId: string) => ({
  field: 'hidden',
  type: 'set',
  value: true,
  conditions: [{ childId: catalogueId, scope: 'primary-catalogue', type: 'instanceOf' }],
});

/** A catalogue whose root link goes entry → group → detachments (as Orks does). */
const catalogue = (id: string, name: string, detachments: unknown[], extra: object = {}) => ({
  catalogue: {
    id,
    name,
    library: false,
    entryLinks: [{ name: 'Detachment', type: 'selectionEntry', targetId: `${id}-entry` }],
    sharedSelectionEntries: [
      {
        id: `${id}-entry`,
        name: 'Detachment',
        entryLinks: [{ name: 'Detachment', type: 'selectionEntryGroup', targetId: `${id}-group` }],
      },
    ],
    sharedSelectionEntryGroups: [
      { id: `${id}-group`, name: 'Detachment', selectionEntries: detachments },
    ],
    ...extra,
  },
});

describe('parseBsdataCatalogues', () => {
  it('reads a faction’s detachments through its links', () => {
    const { factions } = parseBsdataCatalogues([
      catalogue('nec', 'Xenos - Necrons', [entry('Awakened Dynasty'), entry('Canoptek Court')]),
    ]);
    expect(factions.get('Necrons')).toEqual(['Awakened Dynasty', 'Canoptek Court']);
  });

  it('reads detachments kept in a shared library, minus those hidden for the faction', () => {
    const library = {
      catalogue: {
        id: 'lib',
        name: 'Aeldari - Aeldari Library',
        library: true,
        sharedSelectionEntries: [
          {
            id: 'lib-entry',
            name: 'Detachments',
            selectionEntryGroups: [
              {
                name: 'Detachment',
                selectionEntries: [
                  entry('Warhost', [hiddenFor('dru')]),
                  entry('Realspace Raiders', [hiddenUnless('dru')]),
                ],
              },
            ],
          },
        ],
      },
    };
    const link = (id: string, name: string) => ({
      catalogue: {
        id,
        name,
        library: false,
        entryLinks: [{ name: 'Detachment', type: 'selectionEntry', targetId: 'lib-entry' }],
      },
    });
    const { factions } = parseBsdataCatalogues([
      library,
      link('ael', 'Xenos - Aeldari'),
      link('dru', 'Xenos - Drukhari'),
    ]);
    expect(factions.get('Aeldari')).toEqual(['Warhost']);
    expect(factions.get('Drukhari')).toEqual(['Realspace Raiders']);
  });

  it('gives chapters their own detachments and the open ones of Space Marines', () => {
    const sm = catalogue('sm', 'Imperium - Adeptus Astartes - Space Marines', [
      entry('Gladius Task Force'),
      entry('Rage-Cursed Onslaught', [hiddenUnless('ba')]),
    ]);
    const chapter = (id: string, name: string) => ({
      catalogue: {
        id,
        name,
        library: false,
        catalogueLinks: [{ targetId: 'sm', importRootEntries: true }],
      },
    });
    const { factions } = parseBsdataCatalogues([
      sm,
      chapter('ba', 'Imperium - Adeptus Astartes - Blood Angels'),
      chapter('um', 'Imperium - Adeptus Astartes - Ultramarines'),
    ]);
    expect(factions.get('Blood Angels')).toEqual(['Gladius Task Force', 'Rage-Cursed Onslaught']);
    // Space Marines takes every Adeptus Astartes detachment (BCP counts some chapters there).
    expect(factions.get('Space Marines (Astartes)')).toEqual([
      'Gladius Task Force',
      'Rage-Cursed Onslaught',
    ]);
  });

  it('borrows only from the same family, and leaves out libraries and hidden entries', () => {
    const agents = catalogue('ag', 'Imperium - Agents of the Imperium', [
      entry('Imperialis Fleet'),
    ]);
    const custodes = catalogue('cu', 'Imperium - Adeptus Custodes', [
      entry('Shield Host'),
      { ...entry('Old Host'), hidden: true },
    ]);
    custodes.catalogue = {
      ...custodes.catalogue,
      catalogueLinks: [{ targetId: 'ag', importRootEntries: true }],
    } as typeof custodes.catalogue;
    const { factions } = parseBsdataCatalogues([agents, custodes]);
    expect(factions.get('Adeptus Custodes')).toEqual(['Shield Host']);
    expect(factions.get('Imperial Agents')).toEqual(['Imperialis Fleet']);
  });

  it('lists catalogues with detachments whose faction it doesn’t know, and ignores bad input', () => {
    const result = parseBsdataCatalogues([
      catalogue('x', 'Xenos - Hrud', [entry('Warren Host')]),
      { nonsense: true },
      null,
    ]);
    expect(result.unknownCatalogues).toEqual(['Xenos - Hrud']);
    expect(result.factions.size).toBe(0);
  });
});
