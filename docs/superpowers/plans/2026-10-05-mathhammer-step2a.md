# Mathhammer, Step 2a (Units from 39k.pro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill either side of the Mathhammer page by picking a faction, a unit, its size and attached characters from 39k.pro's datasheets, with weapon keywords read automatically, Best profiles, per-weapon switches, and a Shooting/Fighting phase.

**Architecture:** The API reads 39k.pro's script daily as text (never run), extracts per-datasheet unit data (models, sizes, default loadout, weapon profiles with keyword names, Feel No Pain, Stealth, Damaged, leader/support links) into one stored JSON row, and serves factions and a faction's datasheets. Shared code reads weapon keyword names against the target. The page converts a picked datasheet into weapon rows or model rows, chooses Best profiles by trying them through the exact engine, and keeps every value editable.

**Tech Stack:** TypeScript, Zod 4, Hono, Drizzle (Postgres/PGlite), React 19, Mantine 9, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-mathhammer-step2-design.md` (§7 delivery 2a), building on `2026-10-05-mathhammer-design.md`.

## Global Constraints

- Branch `mathhammer`; never merge to main (merging means releasing to production for the owner).
- 39k.pro's script is never executed (`readJsLiteral` only); only `https://39k.pro/` is fetched, no redirects, a byte limit while reading; English only; Combat Patrol left out.
- One stored JSON row (`rules_snapshot`), replaced whole on success; failures keep the last good copy and are recorded; daily read with the hourly check; `RULES_ENABLED` (default on, `'false'` in Playwright); `RULES_FORMAT` forces a re-read when the extraction changes.
- No network in tests (sample bundle and stubbed fetch).
- Before `pnpm` or `git commit`: `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`.
- Prototype note: every file below was written and run before this plan (1,188 tests green, `tsc` and `eslint` clean on the whole repo; real-data checks: 34 factions, 1,056 datasheets, 4,576 weapons; Hellblasters + Captain into Boyz + Warboss gives a sensible result).

## Decisions in this plan (rulings against the specs' detail)

- **Reused code:** the 39k.pro literal reader, client, sync, routes and Settings card come from the discarded Matchup prep branch (commit `bf2e86d`, still in git), adapted to unit data.
- **Shooting / Fighting switch (new):** the spec didn't say which weapons of a picked unit attack together. The attacker gets a phase switch: Shooting counts ranged weapons, Fighting melee ones; a datasheet's CLOSE-QUARTERS (pistol) weapons sit out while the unit has other guns (11e: each model fires one or the other). Rows that sit out say why.
- **Hidden statlines** (a sergeant shown with the squad) are models of the unit; kinds with the same T/Sv/InSv/W become one defender row.
- **Best** tries every combination of Best weapons up to 16, else settles each Best weapon in turn; scored by expected models slain after overkill, then wounds dealt. Best rows show the first profile's values greyed, plus "Best here: <profile>".
- **"Own switches"** on a weapon copies the unit's switches as a starting point and then replaces them for that weapon.
- **Anti "non-" forms** are read against the target when calculating; the engine gains Anti keyword `*` (applies to any target).
- **Stored data in an older shape** is treated as not read yet (no 500).
- **"Use" button:** picking fills the side only when "Use" is pressed, so edits aren't overwritten by browsing.

## Review Focus

1. **Big factions** (Space Marines with all chapters, ~200 datasheets): the units answer stays reasonable (~400 KB) and the picker stays usable (searchable). Checked in the Task 8 run.
2. **Datasheets with odd data** (no sizes, no default loadout, a profile without a plain Strength): picking still fills something editable, never crashes. Pinned by the extractor skipping models without numbers and the converter skipping weapons without profiles.
3. **Re-picking a unit** after edits replaces the side (that is the point of "Use"); the defender's switches are kept. Pinned in `datasheet-form.test.ts`.
4. **No unit data yet**: the pickers say "refresh it in Settings" and typing by hand still works. Pinned in the page test.
5. **Conditional keywords when the target changes** (e.g. LETHAL HITS: non-MONSTER/VEHICLE): re-read on every calculation. Pinned in `best.test.ts`.

---

### Task 1: Unit data format and weapon keyword reading (shared)

**Files:**

- Create: `packages/shared/src/mathhammer/data.ts`
- Create: `packages/shared/src/mathhammer/keywords.ts`
- Test: `packages/shared/src/mathhammer/keywords.test.ts`
- Modify: `packages/shared/src/mathhammer/engine.ts`
- Modify: `packages/shared/src/mathhammer/simulate.ts`
- Modify: `packages/shared/src/mathhammer/engine.test.ts`
- Modify: `packages/shared/src/mathhammer/index.ts`

**Interfaces:**

- Produces: `UnitProfile`, `UnitWeapon`, `UnitModel`, `UnitSize`, `UnitDatasheet`, `RulesFaction`, `UnitData` (+ schemas), `RulesStatus`, `MathhammerFactions`, `MathhammerUnits`, `cleanRulesText`, `factionFamily(faction, factions)`; `readKeywords(names, targetKeywords): WeaponKeywords`; engine Anti keyword `'*'` = any target.

- [ ] **Step 1: Write the failing test `packages/shared/src/mathhammer/keywords.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { readKeywords } from './keywords';
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
```

- [ ] **Step 2: Write the failing test `packages/shared/src/mathhammer/engine.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { calculate, DiceError } from './engine';
import { SITUATION, calc, crowd, defender, group, weapon } from './test-helpers';
import type { Situation } from './types';

/** Average wounds of a calculation (into `crowd`: hits × wound chance, nothing saved). */
const wounds = (c: Parameters<typeof calc>[0]) =>
  calculate(calc({ defender: crowd, ...c })).averages.woundsDealt;
const at = (s: Partial<Situation>) => ({ ...SITUATION, ...s });

describe('calculate', () => {
  it('matches a hand-worked case: 10 attacks BS3+ S4 AP-1 D1 into T4 Sv3+', () => {
    const result = calculate(
      calc({
        weapons: [weapon({ models: 10, ap: -1 })],
        defender: defender({ groups: [group({ models: 20 })] }),
      }),
    );
    expect(result.averages.woundsDealt).toBeCloseTo(10 * (4 / 6) * (1 / 2) * (1 / 2));
    expect(result.modelsSlain.reduce((s, p) => s + p, 0)).toBeCloseTo(1);
  });

  it('hits: BS, cover and Ignores Cover, plunging fire, Heavy, Damaged, the ±1 cap', () => {
    const six = weapon({ models: 6 });
    expect(wounds({ weapons: [six] })).toBeCloseTo(2);
    expect(wounds({ weapons: [six], situation: at({ cover: true }) })).toBeCloseTo(1.5);
    expect(
      wounds({
        weapons: [weapon({ models: 6, mods: { ignoresCover: true } })],
        situation: at({ cover: true }),
      }),
    ).toBeCloseTo(2);
    expect(wounds({ weapons: [six], defender: { ...crowd, stealth: true } })).toBeCloseTo(1.5);
    expect(wounds({ weapons: [six], situation: at({ plungingFire: true }) })).toBeCloseTo(2.5);
    expect(wounds({ weapons: [weapon({ models: 6, heavy: true })] })).toBeCloseTo(2.5);
    expect(
      wounds({
        weapons: [weapon({ models: 6, heavy: true })],
        situation: at({ movedOver3: true }),
      }),
    ).toBeCloseTo(2);
    expect(
      wounds({ weapons: [weapon({ models: 6, heavy: true, mods: { hitModifier: 1 } })] }),
    ).toBeCloseTo(2.5);
    expect(wounds({ weapons: [six], situation: at({ attackerDamaged: true }) })).toBeCloseTo(1.5);
    expect(
      wounds({
        weapons: [weapon({ models: 6, mods: { hitModifier: -1, hitIgnorePenalties: true } })],
      }),
    ).toBeCloseTo(2);
  });

  it('ignoring penalties drops the -1s and keeps the +1s', () => {
    const heavy = weapon({ models: 6, heavy: true, mods: { hitIgnorePenalties: true } });
    const minusOne = { ...crowd, hitModifier: -1 };
    expect(wounds({ weapons: [heavy], defender: minusOne })).toBeCloseTo(2.5);
    const lance = weapon({ models: 6, lance: true, mods: { woundIgnorePenalties: true } });
    expect(
      wounds({
        weapons: [lance],
        defender: { ...crowd, woundModifier: -1 },
        situation: at({ charged: true }),
      }),
    ).toBeCloseTo(6 * (4 / 6) * (4 / 6));
  });

  it('snap shooting hits only on 6s, without criticals or re-rolls', () => {
    const gun = weapon({ models: 6, mods: { sustainedHits: '1', hitReroll: 'failures' } });
    expect(wounds({ weapons: [gun], situation: at({ snapShooting: true }) })).toBeCloseTo(0.5);
  });

  it('indirect shooting: cover, no re-rolls, 6s only unless stationary and visible', () => {
    const gun = weapon({ models: 6, indirectFire: true, mods: { hitReroll: 'failures' } });
    expect(wounds({ weapons: [gun], situation: at({ indirectShooting: true }) })).toBeCloseTo(0.5);
    expect(
      wounds({
        weapons: [gun],
        situation: at({ indirectShooting: true, indirectStationaryVisible: true }),
      }),
    ).toBeCloseTo(1.5);
  });

  it('Torrent, Lance, Anti-X, Rapid Fire and Blast', () => {
    expect(
      wounds({ weapons: [weapon({ models: 6, skill: null, mods: { torrent: true } })] }),
    ).toBeCloseTo(3);
    expect(
      wounds({ weapons: [weapon({ models: 6, lance: true })], situation: at({ charged: true }) }),
    ).toBeCloseTo(6 * (4 / 6) * (4 / 6));
    const anti = weapon({ models: 6, strength: 3, anti: [{ keyword: 'INFANTRY', value: 4 }] });
    expect(wounds({ weapons: [anti] })).toBeCloseTo(6 * (4 / 6) * (2 / 6));
    expect(wounds({ weapons: [anti], defender: { ...crowd, keywords: ['Infantry'] } })).toBeCloseTo(
      2,
    );
    // '*': an Anti that applies whatever the target (a 'non-' Anti the target qualifies for).
    const anyTarget = weapon({ models: 6, strength: 3, anti: [{ keyword: '*', value: 4 }] });
    expect(wounds({ weapons: [anyTarget] })).toBeCloseTo(2);
    const rapid = weapon({ models: 6, rapidFire: '1' });
    expect(wounds({ weapons: [rapid], situation: at({ halfRange: true }) })).toBeCloseTo(4);
    expect(wounds({ weapons: [rapid] })).toBeCloseTo(2);
    // 1 attack + 1 per 5 of 10 models.
    const blast = calculate(
      calc({
        weapons: [weapon({ blast: 1 })],
        defender: defender({ groups: [group({ models: 10, save: 7 })] }),
      }),
    );
    expect(blast.averages.woundsDealt).toBeCloseTo(3 * (4 / 6) * (1 / 2));
  });

  it('saves: AP, invulnerable saves, Armour of Contempt, worsened saves', () => {
    const target = defender({ groups: [group({ models: 100, save: 4 })] });
    const sure = weapon({ models: 6, skill: null, strength: 8, mods: { torrent: true } });
    const ap1 = { ...sure, ap: -1 };
    const base = 6 * (5 / 6);
    expect(calculate(calc({ weapons: [ap1], defender: target })).averages.woundsDealt).toBeCloseTo(
      base * (4 / 6),
    );
    expect(
      calculate(
        calc({ weapons: [ap1], defender: target, situation: at({ armourOfContempt: true }) }),
      ).averages.woundsDealt,
    ).toBeCloseTo(base * (3 / 6));
    const invuln = defender({ groups: [group({ models: 100, save: 4, invuln: 5 })] });
    expect(
      calculate(calc({ weapons: [{ ...sure, ap: -3 }], defender: invuln })).averages.woundsDealt,
    ).toBeCloseTo(base * (4 / 6));
    const worse = { ...sure, mods: { ...sure.mods, saveModifier: 1 } };
    expect(
      calculate(calc({ weapons: [worse], defender: target })).averages.woundsDealt,
    ).toBeCloseTo(base * (4 / 6));
    expect(
      calculate(calc({ weapons: [worse], defender: { ...target, savePenaltiesIgnored: true } }))
        .averages.woundsDealt,
    ).toBeCloseTo(base * (3 / 6));
  });

  it('damage: overkill is wasted, Feel No Pain, Melta, halving and reduction', () => {
    const sure = weapon({ skill: null, strength: 8, damage: 'D3', mods: { torrent: true } });
    const ones = defender({ groups: [group({ models: 5, save: 7 })] });
    const r = calculate(calc({ weapons: [sure], defender: ones }));
    expect(r.averages.modelsSlain).toBeCloseTo(5 / 6);
    expect(r.averages.wasted).toBeCloseTo((5 / 6) * 1);
    const fnp = defender({ groups: [group({ models: 5, save: 7, fnp: 4 })] });
    expect(
      calculate(calc({ weapons: [{ ...sure, damage: '1' }], defender: fnp })).averages.modelsSlain,
    ).toBeCloseTo(5 / 6 / 2);
    const big = defender({ groups: [group({ models: 1, save: 7, wounds: 20 })] });
    const melta = { ...sure, damage: '2', melta: 2 };
    expect(
      calculate(calc({ weapons: [melta], defender: big, situation: at({ halfRange: true }) }))
        .averages.woundsDealt,
    ).toBeCloseTo((5 / 6) * 4);
    expect(
      calculate(
        calc({ weapons: [melta], defender: { ...big, halveDamage: true, damageReduction: 1 } }),
      ).averages.woundsDealt,
    ).toBeCloseTo(5 / 6);
  });

  it('Devastating Wounds: mortal wounds after normal damage, one model per critical wound', () => {
    const dev = weapon({
      skill: null,
      strength: 8,
      damage: '3',
      mods: { torrent: true, devastatingWounds: true, critWoundOn: 2 },
    });
    const r = calculate(
      calc({
        weapons: [dev],
        defender: defender({ groups: [group({ models: 5, save: 2, invuln: 2 })] }),
      }),
    );
    expect(r.averages.modelsSlain).toBeCloseTo(5 / 6);
    expect(r.averages.wasted).toBeCloseTo((5 / 6) * 2);
  });

  it('attached units: bodyguard Toughness, the leader last, Precision, leader slain', () => {
    const guard = group({ models: 1, toughness: 3, save: 7 });
    const leader = group({ models: 1, toughness: 8, save: 7, character: true });
    const s4 = weapon({ skill: null, mods: { torrent: true } });
    const attached = calculate(
      calc({ weapons: [s4], defender: defender({ attached: true, groups: [guard, leader] }) }),
    );
    // S4 vs the bodyguard's T3: wounds on 3+.
    expect(attached.averages.modelsSlain).toBeCloseTo(4 / 6);
    expect(attached.leaderSlain).toBeCloseTo(0);
    const precise = calculate(
      calc({
        weapons: [{ ...s4, precision: true }],
        defender: defender({ attached: true, groups: [guard, leader] }),
      }),
    );
    expect(precise.leaderSlain).toBeCloseTo(4 / 6);
  });

  it('the defender declares the order that loses the fewest models', () => {
    const boyz = group({ name: 'Boyz', models: 9, save: 7 });
    const nob = group({ name: 'Nob', models: 1, save: 7, wounds: 2 });
    const r = calculate(
      calc({
        weapons: [weapon({ models: 2, skill: null, mods: { torrent: true } })],
        defender: defender({ groups: [boyz, nob] }),
      }),
    );
    expect(r.orders).toEqual([[1, 0]]);
  });

  it('skips weapons nobody fires, and a target with only a leader', () => {
    expect(calculate(calc({ weapons: [weapon({ models: 0 })] })).modelsSlain).toEqual([1]);
    const lone = defender({
      attached: true,
      groups: [group({ models: 1, save: 7, character: true })],
    });
    expect(
      calculate(
        calc({ weapons: [weapon({ skill: null, mods: { torrent: true } })], defender: lone }),
      ).leaderSlain,
    ).toBeCloseTo(1 / 2);
  });

  it('flat mortal wounds, the chance to wipe, and readable errors', () => {
    const r = calculate(
      calc({
        weapons: [],
        flatMortals: '2',
        defender: defender({ groups: [group({ models: 2 })] }),
      }),
    );
    expect(r.wipe).toBeCloseTo(1);
    expect(() => calculate(calc({ weapons: [weapon({ attacks: '2Q' })] }))).toThrow(DiceError);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/`
Expected: FAIL (modules or behaviour not there yet).

- [ ] **Step 4: Write `packages/shared/src/mathhammer/data.ts`**

```ts
import { z } from 'zod';

/** One profile of a weapon, as 39k.pro gives it (numbers already read). */
export const UnitProfileSchema = z.object({
  name: z.string(),
  melee: z.boolean(),
  range: z.string().nullable(),
  attacks: z.string(),
  /** BS/WS: 3 for 3+; null for "-" (Torrent weapons and the like). */
  skill: z.number().int().nullable(),
  /** null when it isn't a plain number (e.g. "D6+6"). */
  strength: z.number().int().nullable(),
  ap: z.number().int(),
  damage: z.string(),
  /** Weapon ability names as written: "Sustained Hits 2", "ANTI-INFANTRY 4+", "Blast". */
  keywords: z.array(z.string()),
});
export type UnitProfile = z.infer<typeof UnitProfileSchema>;

export const UnitWeaponSchema = z.object({
  id: z.string(),
  name: z.string(),
  profiles: z.array(UnitProfileSchema),
});
export type UnitWeapon = z.infer<typeof UnitWeaponSchema>;

/** A kind of model in the unit. */
export const UnitModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  toughness: z.number().int(),
  /** 7 for no save. */
  save: z.number().int(),
  invuln: z.number().int().nullable(),
  wounds: z.number().int(),
});
export type UnitModel = z.infer<typeof UnitModelSchema>;

/** One way to field the unit: how many of each kind of model. */
export const UnitSizeSchema = z.object({
  points: z.number().nullable(),
  models: z.array(z.object({ modelId: z.string(), count: z.number().int() })),
});
export type UnitSize = z.infer<typeof UnitSizeSchema>;

export const UnitDatasheetSchema = z.object({
  id: z.string(),
  name: z.string(),
  legends: z.boolean(),
  /** The app's faction names. */
  factions: z.array(z.string()),
  /** All its models' keywords, upper-case. */
  keywords: z.array(z.string()),
  models: z.array(UnitModelSchema),
  /** Smallest first. */
  sizes: z.array(UnitSizeSchema),
  /** Default wargear: each model of `modelId` carries `count` of `weaponId`. */
  loadout: z.array(
    z.object({ modelId: z.string(), weaponId: z.string(), count: z.number().int() }),
  ),
  weapons: z.array(UnitWeaponSchema),
  fnp: z.number().int().nullable(),
  stealth: z.boolean(),
  /** Damaged X: the model is damaged at X or fewer wounds left. */
  damaged: z.number().int().nullable(),
  /** The datasheet's own abilities (for reading, step 3). */
  abilities: z.array(z.object({ name: z.string(), text: z.string() })),
  /** Datasheet ids this character can lead / support. */
  leads: z.array(z.string()),
  supports: z.array(z.string()),
});
export type UnitDatasheet = z.infer<typeof UnitDatasheetSchema>;

/** A 39k.pro faction keyword with the app's faction name; chapters name their parent. */
export const RulesFactionSchema = z.object({
  name: z.string(),
  faction: z.string(),
  parent: z.string().nullable(),
});
export type RulesFaction = z.infer<typeof RulesFactionSchema>;

/** Everything Mathhammer uses from 39k.pro, in English. */
export const UnitDataSchema = z.object({
  factions: z.array(RulesFactionSchema),
  datasheets: z.array(UnitDatasheetSchema),
});
export type UnitData = z.infer<typeof UnitDataSchema>;

/** GET /api/rules: the data read from 39k.pro, when, and the last check's error. */
export const RulesStatusSchema = z.object({
  checkedAt: z.iso.datetime().nullable(),
  readAt: z.iso.datetime().nullable(),
  bundle: z.string().nullable(),
  dataVersion: z.number().int().nullable(),
  counts: z
    .object({ factions: z.number().int(), datasheets: z.number().int(), weapons: z.number().int() })
    .nullable(),
  error: z.string().nullable(),
});
export type RulesStatus = z.infer<typeof RulesStatusSchema>;

/** GET /api/mathhammer/factions. */
export const MathhammerFactionsSchema = z.object({
  factions: z.array(z.object({ faction: z.string(), units: z.number().int() })),
});
export type MathhammerFactions = z.infer<typeof MathhammerFactionsSchema>;

/** GET /api/mathhammer/units?faction=: the faction's datasheets (its chapters' and parent's too). */
export const MathhammerUnitsSchema = z.object({
  faction: z.string(),
  datasheets: z.array(UnitDatasheetSchema),
});
export type MathhammerUnits = z.infer<typeof MathhammerUnitsSchema>;

/**
 * GW-app rules text as plain text: `<k>keyword</k>` becomes `**KEYWORD**`, other tags go,
 * carriage returns and non-breaking spaces become plain.
 */
export function cleanRulesText(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  return text
    .replace(/\r/g, '')
    .replace(/<k>(.*?)<\/k>/gs, (_, keyword: string) => `**${keyword.toUpperCase()}**`)
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/**
 * The faction family: the faction, its parent (a chapter's Space Marines) and its children (Space
 * Marines' chapters). Lists write Space Wolves armies as "Space Marines", so units of all of them
 * are offered together.
 */
export function factionFamily(faction: string, factions: RulesFaction[]): string[] {
  const family = new Set([faction]);
  for (const f of factions) {
    if (f.faction === faction && f.parent !== null) family.add(f.parent);
    if (f.parent === faction) family.add(f.faction);
  }
  return [...family].sort();
}
```

- [ ] **Step 5: Write `packages/shared/src/mathhammer/keywords.ts`**

```ts
import { NO_KEYWORDS, type WeaponKeywords } from './weapons';

/** "SUSTAINED HITS 2: MONSTER/VEHICLE" → the ability and its condition. */
const CONDITION = /^(.*?)\s*:\s*(non-)?\s*([A-Za-z][A-Za-z /'-]*)$/i;
const ANTI = /^anti-?\s*(non-)?\s*(.+?)\s+([2-6])\+$/i;

const tidy = (name: string) => name.replace(/[‐‑–]/g, '-').replace(/\s+/g, ' ').trim();

/** Upper-case keywords from "MONSTER/VEHICLE". */
const keywordsOf = (text: string) =>
  text
    .split('/')
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k !== '');

/**
 * What a weapon's ability names (as 39k.pro writes them) do to the maths against a target with
 * these keywords. Conditional forms ("…: MONSTER/VEHICLE", "…: non-MONSTER/VEHICLE") apply only
 * when the target has (or lacks) one of them. Names that change no numbers (Hazardous, Pistol,
 * One Shot…) are left out.
 */
export function readKeywords(names: string[], targetKeywords: string[]): WeaponKeywords {
  const target = new Set(targetKeywords.map((k) => k.toUpperCase()));
  const has = (keywords: string[]) => keywords.some((k) => target.has(k));
  const out: WeaponKeywords = { ...NO_KEYWORDS, anti: [] };
  for (const raw of names) {
    let name = tidy(raw);
    const anti = ANTI.exec(name);
    if (anti !== null) {
      const keywords = keywordsOf(anti[2] ?? '');
      const value = Number(anti[3]);
      if (anti[1] === undefined) out.anti.push(...keywords.map((keyword) => ({ keyword, value })));
      else if (!has(keywords)) out.anti.push({ keyword: '*', value });
      continue;
    }
    const condition = CONDITION.exec(name);
    if (condition !== null) {
      const keywords = keywordsOf(condition[3] ?? '');
      const applies = condition[2] === undefined ? has(keywords) : !has(keywords);
      if (!applies) continue;
      name = condition[1] ?? '';
    }
    const lower = name.toLowerCase();
    const value = (pattern: RegExp) => pattern.exec(lower)?.[1];
    if (lower === 'lethal hits') out.lethalHits = true;
    else if (/^sustained hits( \S+)?$/.test(lower))
      out.sustainedHits = value(/^sustained hits (\S+)$/) ?? '1';
    else if (lower === 'devastating wounds') out.devastatingWounds = true;
    else if (lower === 'twin-linked' || lower === 'twin linked') out.twinLinked = true;
    else if (lower === 'torrent') out.torrent = true;
    else if (lower === 'heavy') out.heavy = true;
    else if (lower === 'lance') out.lance = true;
    else if (lower === 'ignores cover') out.ignoresCover = true;
    else if (lower === 'precision') out.precision = true;
    else if (lower === 'indirect fire') out.indirectFire = true;
    else if (/^rapid fire( \S+)?$/.test(lower))
      out.rapidFire = (value(/^rapid fire (\S+)$/) ?? '1').toUpperCase();
    else if (/^blast( \d+)?$/.test(lower)) out.blast = Number(value(/^blast (\d+)$/) ?? 1);
    else if (/^cleave( \d+)?$/.test(lower)) out.cleave = Number(value(/^cleave (\d+)$/) ?? 1);
    else if (/^melta \d+$/.test(lower)) out.melta = Number(value(/^melta (\d+)$/));
  }
  if (out.sustainedHits !== null) out.sustainedHits = out.sustainedHits.toUpperCase();
  return out;
}
```

- [ ] **Step 6: Change `packages/shared/src/mathhammer/engine.ts`** (apply with `git apply` or by hand)

```diff
diff --git a/packages/shared/src/mathhammer/engine.ts b/packages/shared/src/mathhammer/engine.ts
index c3aeddb..32a1142 100644
--- a/packages/shared/src/mathhammer/engine.ts
+++ b/packages/shared/src/mathhammer/engine.ts
@@ -124,7 +124,9 @@ function setUp(
   const keywords = new Set(defender.keywords.map((k) => k.toUpperCase()));
   const critWoundOn = Math.min(
     m.critWoundOn,
-    ...weapon.anti.filter((a) => keywords.has(a.keyword.toUpperCase())).map((a) => a.value),
+    ...weapon.anti
+      .filter((a) => a.keyword === '*' || keywords.has(a.keyword.toUpperCase()))
+      .map((a) => a.value),
   );
   const classifyWound: Classify = (face) => {
     if (face === 1) return 0;
```

- [ ] **Step 7: Change `packages/shared/src/mathhammer/simulate.ts`** (apply with `git apply` or by hand)

```diff
diff --git a/packages/shared/src/mathhammer/simulate.ts b/packages/shared/src/mathhammer/simulate.ts
index b91372a..f3608e9 100644
--- a/packages/shared/src/mathhammer/simulate.ts
+++ b/packages/shared/src/mathhammer/simulate.ts
@@ -227,7 +227,9 @@ export function simulate(
         const kws = new Set(defender.keywords.map((k) => k.toUpperCase()));
         const critOn = Math.min(
           m.critWoundOn,
-          ...weapon.anti.filter((a) => kws.has(a.keyword.toUpperCase())).map((a) => a.value),
+          ...weapon.anti
+            .filter((a) => a.keyword === '*' || kws.has(a.keyword.toUpperCase()))
+            .map((a) => a.value),
         );
         const woundResult = (f: number): number =>
           f === 1 ? 0 : f >= critOn ? 2 : f + woundMod >= need ? 1 : 0;
```

- [ ] **Step 8: Change `packages/shared/src/mathhammer/index.ts`** (apply with `git apply` or by hand)

```diff
diff --git a/packages/shared/src/mathhammer/index.ts b/packages/shared/src/mathhammer/index.ts
index a3101c5..655d3fc 100644
--- a/packages/shared/src/mathhammer/index.ts
+++ b/packages/shared/src/mathhammer/index.ts
@@ -1,5 +1,7 @@
+export * from './data';
 export * from './dice';
 export * from './engine';
 export * from './types';
 export * from './weapons';
 export type { Reroll } from './rolls';
+export * from './keywords';
```

- [ ] **Step 9: Run the tests and checks**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/`
Expected: PASS (the files above hold 17 tests).
Then: `pnpm typecheck && pnpm exec eslint <the files above>` → no errors.

- [ ] **Step 10: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add packages/shared/src/mathhammer/data.ts packages/shared/src/mathhammer/engine.test.ts packages/shared/src/mathhammer/engine.ts packages/shared/src/mathhammer/index.ts packages/shared/src/mathhammer/keywords.test.ts packages/shared/src/mathhammer/keywords.ts packages/shared/src/mathhammer/simulate.ts
git commit -m "feat: mathhammer unit data format and weapon keyword reading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 39k.pro literal reader and client (restored)

**Files:**

- Create: `apps/api/src/rules/js-literal.ts`
- Test: `apps/api/src/rules/js-literal.test.ts`
- Create: `apps/api/src/rules/client.ts`
- Test: `apps/api/src/rules/client.test.ts`

**Interfaces:**

- Produces: `readJsLiteral(text, start)`, `JsLiteralError`; `RULES_SITE`, `RulesClient { homePage(); bundle(url) }`, `bundleUrlOf(html)`, `httpRulesClient(options)` (no redirects, byte limit while reading).

- [ ] **Step 1: Write the failing test `apps/api/src/rules/js-literal.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { JsLiteralError, readJsLiteral } from './js-literal';

describe('readJsLiteral', () => {
  it('reads objects with bare, quoted and numeric keys, and says where it stopped', () => {
    const text = 'x={a:1,"b c":[2,"x"],3:null};rest';
    const { value, end } = readJsLiteral(text, 2);
    expect(value).toEqual({ a: 1, 'b c': [2, 'x'], '3': null });
    expect(text.slice(end)).toBe(';rest');
  });

  it('reads minified booleans, void 0 and numbers', () => {
    expect(readJsLiteral('[!0,!1,void 0,true,false,-1.5,2e3,.5]', 0).value).toEqual([
      true,
      false,
      null,
      true,
      false,
      -1.5,
      2000,
      0.5,
    ]);
  });

  it('reads strings in all three quotes with escapes', () => {
    const text = String.raw`["a\"b",'it\'s',"\x41B\u{43}","tab\there"]`;
    expect(readJsLiteral(text, 0).value).toEqual(['a"b', "it's", 'ABC', 'tab\there']);
    expect(readJsLiteral('[`two\nlines`]', 0).value).toEqual(['two\nlines']);
  });

  it('allows trailing commas', () => {
    expect(readJsLiteral('{a:[1,2,],}', 0).value).toEqual({ a: [1, 2] });
  });

  it('refuses code: calls, variables, templates with ${}', () => {
    expect(() => readJsLiteral('{a:foo()}', 0)).toThrow(JsLiteralError);
    expect(() => readJsLiteral('{a:foo}', 0)).toThrow(/Unexpected value/);
    expect(() => readJsLiteral('[`x${y}`]', 0)).toThrow(/Template/);
    expect(() => readJsLiteral('{a:"open', 0)).toThrow(/Unterminated/);
  });

  it('never sets an object’s prototype', () => {
    const { value } = readJsLiteral('{__proto__:{x:1},a:1}', 0);
    expect(value).toEqual({ a: 1 });
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  });
});
```

- [ ] **Step 2: Write the failing test `apps/api/src/rules/client.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_BUNDLE_URL, SAMPLE_HOME } from '../test/rules-sample';
import { bundleUrlOf, httpRulesClient } from './client';

describe('bundleUrlOf', () => {
  it('finds the script on 39k.pro’s home page', () => {
    expect(bundleUrlOf(SAMPLE_HOME)).toBe(SAMPLE_BUNDLE_URL);
  });

  it('only takes a script on 39k.pro itself', () => {
    expect(() =>
      bundleUrlOf('<script src="https://elsewhere.example/assets/index-1.js"></script>'),
    ).toThrow(/No script found/);
    expect(() => bundleUrlOf('<p>maintenance</p>')).toThrow(/No script found/);
  });
});

describe('httpRulesClient', () => {
  it('never fetches from anywhere but 39k.pro', async () => {
    await expect(httpRulesClient().bundle('https://elsewhere.example/x.js')).rejects.toThrow(
      /Not a 39k.pro address/,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never follows a redirect away from 39k.pro', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('<html></html>')));
    vi.stubGlobal('fetch', fetchMock);
    await httpRulesClient().homePage();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://39k.pro/',
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('stops reading an answer that grows past the limit', async () => {
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(endless))),
    );
    await expect(httpRulesClient({ maxBytes: 10_000 }).homePage()).rejects.toThrow(/too large/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run --project api apps/api/src/rules`
Expected: FAIL (modules or behaviour not there yet).

- [ ] **Step 4: Write `apps/api/src/rules/js-literal.ts`**

```ts
/** A value an object literal in minified JavaScript can hold, as `readJsLiteral` reads it. */
export type JsValue = null | boolean | number | string | JsValue[] | { [key: string]: JsValue };

/** The text isn't a plain literal there: a call, a variable, a broken string. */
export class JsLiteralError extends Error {
  constructor(message: string, at: number) {
    super(`${message} at character ${String(at)}`);
    this.name = 'JsLiteralError';
  }
}

const SPACE = /\s/;
const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[\w$]/;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const WORDS: [string, JsValue][] = [
  ['true', true],
  ['false', false],
  ['null', null],
  ['void 0', null],
];
const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' };

/**
 * Reads the object or array literal starting at `start` in minified JavaScript **without running
 * it**: objects (bare, quoted or numeric keys), arrays, strings in ' " or ` (no `${}`), numbers,
 * true/false/null, `!0`/`!1` and `void 0` (as null). Anything else (a call, a variable) throws:
 * the data isn't where or what it should be. Returns the value and the index just after it.
 */
export function readJsLiteral(text: string, start: number): { value: JsValue; end: number } {
  let i = start;

  function skipSpace(): void {
    while (i < text.length && SPACE.test(text.charAt(i))) i += 1;
  }

  function readString(): string {
    const quote = text.charAt(i);
    i += 1;
    let out = '';
    let from = i;
    for (;;) {
      if (i >= text.length) throw new JsLiteralError('Unterminated string', i);
      const c = text.charAt(i);
      if (c === quote) break;
      if (quote === '`' && c === '$' && text.charAt(i + 1) === '{') {
        throw new JsLiteralError('Template with ${…}', i);
      }
      if (c !== '\\') {
        i += 1;
        continue;
      }
      out += text.slice(from, i);
      const escape = text.charAt(i + 1);
      i += 2;
      const mapped = ESCAPES[escape];
      if (mapped !== undefined) out += mapped;
      else if (escape === 'x') {
        out += String.fromCharCode(parseInt(text.slice(i, i + 2), 16));
        i += 2;
      } else if (escape === 'u' && text.charAt(i) === '{') {
        const close = text.indexOf('}', i);
        out += String.fromCodePoint(parseInt(text.slice(i + 1, close), 16));
        i = close + 1;
      } else if (escape === 'u') {
        out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16));
        i += 4;
      } else if (escape === '\r') {
        // A line continuation adds nothing.
        if (text.charAt(i) === '\n') i += 1;
      } else if (escape !== '\n') {
        out += escape === '0' ? '\0' : escape;
      }
      from = i;
    }
    out += text.slice(from, i);
    i += 1;
    return out;
  }

  function readNumber(): number | null {
    const match = NUMBER.exec(text.slice(i, i + 40));
    if (match === null) return null;
    i += match[0].length;
    return Number(match[0]);
  }

  function readKey(): string {
    const c = text.charAt(i);
    if (c === '"' || c === "'" || c === '`') return readString();
    if (IDENT_START.test(c)) {
      const from = i;
      while (i < text.length && IDENT_PART.test(text.charAt(i))) i += 1;
      return text.slice(from, i);
    }
    const number = readNumber();
    if (number === null) throw new JsLiteralError('Unexpected key', i);
    return String(number);
  }

  function readObject(): JsValue {
    i += 1;
    const object: Record<string, JsValue> = {};
    for (;;) {
      skipSpace();
      if (text.charAt(i) === '}') break;
      const key = readKey();
      skipSpace();
      if (text.charAt(i) !== ':') throw new JsLiteralError('Expected :', i);
      i += 1;
      const value = readValue();
      // `__proto__` would set the object's prototype instead of a key: never wanted from data.
      if (key !== '__proto__') object[key] = value;
      skipSpace();
      if (text.charAt(i) === ',') i += 1;
      else if (text.charAt(i) !== '}') throw new JsLiteralError('Expected , or }', i);
    }
    i += 1;
    return object;
  }

  function readArray(): JsValue {
    i += 1;
    const array: JsValue[] = [];
    for (;;) {
      skipSpace();
      if (text.charAt(i) === ']') break;
      array.push(readValue());
      skipSpace();
      if (text.charAt(i) === ',') i += 1;
      else if (text.charAt(i) !== ']') throw new JsLiteralError('Expected , or ]', i);
    }
    i += 1;
    return array;
  }

  function readValue(): JsValue {
    skipSpace();
    const c = text.charAt(i);
    if (c === '{') return readObject();
    if (c === '[') return readArray();
    if (c === '"' || c === "'" || c === '`') return readString();
    if (text.startsWith('!0', i)) {
      i += 2;
      return true;
    }
    if (text.startsWith('!1', i)) {
      i += 2;
      return false;
    }
    for (const [word, result] of WORDS) {
      if (text.startsWith(word, i) && !IDENT_PART.test(text.charAt(i + word.length))) {
        i += word.length;
        return result;
      }
    }
    const number = readNumber();
    if (number !== null) return number;
    throw new JsLiteralError('Unexpected value', i);
  }

  const value = readValue();
  return { value, end: i };
}
```

- [ ] **Step 5: Write `apps/api/src/rules/client.ts`**

```ts
/** 39k.pro: a web app whose script carries the GW app's rules data. */
export const RULES_SITE = 'https://39k.pro/';
/** The app's script, served from 39k.pro itself: `<script … src="/assets/index-<hash>.js">`. */
const SCRIPT = /<script\b[^>]*\bsrc="(\/assets\/index-[\w-]+\.js)"/;

export interface RulesClient {
  /** The home page's HTML. */
  homePage(): Promise<string>;
  /** The script's text (about 28 MB). */
  bundle(url: string): Promise<string>;
}

/** The script's full address, from the home page; it changes whenever the site does. */
export function bundleUrlOf(html: string): string {
  const path = SCRIPT.exec(html)?.[1];
  if (path === undefined)
    throw new Error('No script found on 39k.pro’s home page (the site changed)');
  return new URL(path, RULES_SITE).href;
}

/** Reads 39k.pro over HTTPS; refuses any other address. */
export function httpRulesClient(
  options: { timeoutMs?: number; maxBytes?: number } = {},
): RulesClient {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  const get = async (url: string) => {
    if (!url.startsWith(RULES_SITE)) throw new Error(`Not a 39k.pro address: ${url}`);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'bcp-analyzer' },
      // A redirect could lead anywhere: only 39k.pro's own answers are read.
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`39k.pro answered ${String(response.status)}`);
    const tooLarge = () => new Error('39k.pro’s answer is too large');
    if (Number(response.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge();
    // Counted while reading, so an endless answer stops at the limit instead of filling memory.
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    if (reader === undefined) return '';
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  };
  return { homePage: () => get(RULES_SITE), bundle: (url) => get(url) };
}
```

- [ ] **Step 6: Run the tests and checks**

Run: `pnpm vitest run --project api apps/api/src/rules`
Expected: PASS (the files above hold 11 tests).
Then: `pnpm typecheck && pnpm exec eslint <the files above>` → no errors.

- [ ] **Step 7: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add apps/api/src/rules/client.test.ts apps/api/src/rules/client.ts apps/api/src/rules/js-literal.test.ts apps/api/src/rules/js-literal.ts
git commit -m "feat: read 39k.pro script data as text, only from 39k.pro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Extracting unit data

**Files:**

- Create: `apps/api/src/test/rules-sample.ts`
- Create: `apps/api/src/rules/extract.ts`
- Test: `apps/api/src/rules/extract.test.ts`

**Interfaces:**

- Consumes: Task 1 types and schemas, Task 2 `readJsLiteral`.
- Produces: `RULES_FORMAT = 1`, `RulesShapeError`, `extractUnits(tables): UnitData`, `readRulesBundle(script): { dataVersion; data }`; sample helpers `toJsLiteral`, `sampleTables`, `sampleBundle`, `SAMPLE_BUNDLE_URL`, `SAMPLE_HOME`.

- [ ] **Step 1: Write the test helper `apps/api/src/test/rules-sample.ts`**

```ts
/** A JavaScript literal with bare keys and `!0`/`!1`, as 39k.pro's minified script writes data. */
export function toJsLiteral(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(toJsLiteral).join(',')}]`;
  if (value === true) return '!0';
  if (value === false) return '!1';
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(
      ([key, item]) =>
        `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}:${toJsLiteral(item)}`,
    );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

const loc = (en: Record<string, unknown>) => ({ localisations: { en, de: { name: 'Deutsch' } } });

const model = (
  id: string,
  datasheetId: string,
  name: string,
  stats: { t: string; sv: string; w: string },
  extra: Record<string, unknown> = {},
) => ({
  id,
  datasheetId,
  displayOrder: 0,
  statlineHidden: false,
  movement: '6"',
  toughness: stats.t,
  save: stats.sv,
  wounds: stats.w,
  leadership: '6+',
  objectiveControl: '2',
  ...extra,
  ...loc({ name }),
});

const profile = (
  id: string,
  itemId: string,
  name: string,
  p: { type: string; a: string; skill: string; s: string; ap: string; d: string },
  order = 0,
) => ({
  id,
  wargearItemId: itemId,
  displayOrder: order,
  type: p.type,
  range: p.type === 'melee' ? 'Melee' : '24"',
  attacks: p.a,
  ballisticSkill: p.type === 'melee' ? null : p.skill,
  weaponSkill: p.type === 'melee' ? p.skill : null,
  strength: p.s,
  armourPenetration: p.ap,
  damage: p.d,
  ...loc({ name }),
});

/** A tiny copy of 39k.pro's tables: Intercessors with a Captain, Boyz with a Warboss. */
export const sampleTables = (): Record<string, unknown[]> => ({
  publication: [
    { id: 'pub-sm', factionKeywordId: 'fk-sm', isCoreRules: false, isCombatPatrol: false },
    { id: 'pub-ork', factionKeywordId: 'fk-ork', isCoreRules: false, isCombatPatrol: false },
    { id: 'pub-cp', factionKeywordId: 'fk-sm', isCoreRules: false, isCombatPatrol: true },
  ],
  faction_keyword: [
    {
      id: 'fk-sm',
      parentFactionKeywordId: null,
      excludedFromArmyBuilder: false,
      ...loc({ name: 'Adeptus Astartes', commonName: 'Space Marines' }),
    },
    {
      id: 'fk-ba',
      parentFactionKeywordId: 'fk-sm',
      excludedFromArmyBuilder: false,
      ...loc({ name: 'Blood Angels', commonName: null }),
    },
    {
      id: 'fk-ork',
      parentFactionKeywordId: null,
      excludedFromArmyBuilder: false,
      ...loc({ name: 'Orks', commonName: null }),
    },
  ],
  datasheet: [
    {
      id: 'ds-int',
      publicationId: 'pub-sm',
      isLegends: false,
      ...loc({ name: 'Intercessor Squad' }),
    },
    { id: 'ds-cap', publicationId: 'pub-sm', isLegends: false, ...loc({ name: 'Captain' }) },
    { id: 'ds-boyz', publicationId: 'pub-ork', isLegends: false, ...loc({ name: 'Boyz' }) },
    { id: 'ds-boss', publicationId: 'pub-ork', isLegends: false, ...loc({ name: 'Warboss' }) },
    { id: 'ds-cp', publicationId: 'pub-cp', isLegends: false, ...loc({ name: 'Patrol Squad' }) },
  ],
  datasheet_faction_keyword: [
    { datasheetId: 'ds-int', factionKeywordId: 'fk-sm' },
    { datasheetId: 'ds-cap', factionKeywordId: 'fk-sm' },
    { datasheetId: 'ds-boyz', factionKeywordId: 'fk-ork' },
    { datasheetId: 'ds-boss', factionKeywordId: 'fk-ork' },
    { datasheetId: 'ds-cp', factionKeywordId: 'fk-sm' },
  ],
  miniature: [
    model('m-int', 'ds-int', 'Intercessor', { t: '4', sv: '3+', w: '2' }),
    model(
      'm-sgt',
      'ds-int',
      'Intercessor Sergeant',
      { t: '4', sv: '3+', w: '2' },
      { statlineHidden: true, displayOrder: 1 },
    ),
    model('m-cap', 'ds-cap', 'Captain', { t: '4', sv: '3+', w: '5' }),
    model('m-boy', 'ds-boyz', 'Boy', { t: '5', sv: '5+', w: '1' }),
    model('m-nob', 'ds-boyz', 'Nob', { t: '5', sv: '5+', w: '2' }, { displayOrder: 1 }),
    model('m-boss', 'ds-boss', 'Warboss', { t: '6', sv: '4+', w: '6' }),
    model('m-cp', 'ds-cp', 'Patroller', { t: '4', sv: '3+', w: '2' }),
  ],
  miniature_keyword: [
    { miniatureId: 'm-int', keywordId: 'kw-inf', displayOrder: 1 },
    { miniatureId: 'm-int', keywordId: 'kw-tac', displayOrder: 2 },
    { miniatureId: 'm-sgt', keywordId: 'kw-inf', displayOrder: 1 },
    { miniatureId: 'm-cap', keywordId: 'kw-char', displayOrder: 1 },
    { miniatureId: 'm-cap', keywordId: 'kw-inf', displayOrder: 2 },
    { miniatureId: 'm-boy', keywordId: 'kw-inf', displayOrder: 1 },
    { miniatureId: 'm-boy', keywordId: 'kw-mob', displayOrder: 2 },
    { miniatureId: 'm-boss', keywordId: 'kw-char', displayOrder: 1 },
  ],
  keyword: [
    { id: 'kw-inf', ...loc({ name: 'Infantry' }) },
    { id: 'kw-tac', ...loc({ name: 'Tacticus' }) },
    { id: 'kw-char', ...loc({ name: 'Character' }) },
    { id: 'kw-mob', ...loc({ name: 'Mob' }) },
  ],
  invulnerable_save: [
    { datasheetId: 'ds-cap', miniatureId: null, save: '4+' },
    { datasheetId: 'ds-boss', miniatureId: 'm-boss', save: '5+' },
  ],
  datasheet_ability: [
    { id: 'ab-fnp', abilityType: 'core', ...loc({ name: 'Feel No Pain 6+', rules: 'x' }) },
    { id: 'ab-stealth', abilityType: 'core', ...loc({ name: 'Stealth', rules: 'x' }) },
    { id: 'ab-damaged', abilityType: 'core', ...loc({ name: 'Damaged 3', rules: 'x' }) },
    { id: 'ab-oath', abilityType: 'faction', ...loc({ name: 'Oath of Moment', rules: 'x' }) },
    {
      id: 'ab-bolter',
      abilityType: 'datasheet',
      ...loc({ name: 'Bolter Discipline', rules: 'Re-roll a hit roll of <b>1</b>.' }),
    },
  ],
  datasheet_datasheet_ability: [
    { datasheetId: 'ds-int', datasheetAbilityId: 'ab-bolter', displayOrder: 1 },
    { datasheetId: 'ds-int', datasheetAbilityId: 'ab-oath', displayOrder: 2 },
    { datasheetId: 'ds-boyz', datasheetAbilityId: 'ab-stealth', displayOrder: 1 },
    { datasheetId: 'ds-boss', datasheetAbilityId: 'ab-fnp', displayOrder: 1 },
    { datasheetId: 'ds-boss', datasheetAbilityId: 'ab-damaged', displayOrder: 2 },
  ],
  wargear_item: [
    { id: 'wi-br', wargearType: 'weapon', ...loc({ name: 'Bolt rifle' }) },
    { id: 'wi-pi', wargearType: 'weapon', ...loc({ name: 'Plasma incinerator' }) },
    { id: 'wi-ch', wargearType: 'weapon', ...loc({ name: 'Choppa' }) },
    { id: 'wi-sl', wargearType: 'weapon', ...loc({ name: 'Slugga' }) },
    { id: 'wi-kl', wargearType: 'weapon', ...loc({ name: 'Power klaw' }) },
    { id: 'wi-shield', wargearType: 'wargear', ...loc({ name: 'Relic Shield' }) },
  ],
  wargear_item_profile: [
    profile('wp-br', 'wi-br', 'Bolt rifle', {
      type: 'ranged',
      a: '2',
      skill: '3+',
      s: '4',
      ap: '-1',
      d: '1',
    }),
    profile('wp-pi1', 'wi-pi', 'Standard', {
      type: 'ranged',
      a: '2',
      skill: '3+',
      s: '7',
      ap: '-2',
      d: '1',
    }),
    profile(
      'wp-pi2',
      'wi-pi',
      'Supercharge',
      { type: 'ranged', a: '2', skill: '3+', s: '8', ap: '-3', d: '2' },
      1,
    ),
    profile('wp-ch', 'wi-ch', 'Choppa', {
      type: 'melee',
      a: '3',
      skill: '3+',
      s: '4',
      ap: '-1',
      d: '1',
    }),
    profile('wp-sl', 'wi-sl', 'Slugga', {
      type: 'ranged',
      a: '1',
      skill: '5+',
      s: '4',
      ap: '0',
      d: '1',
    }),
    profile('wp-kl', 'wi-kl', 'Power klaw', {
      type: 'melee',
      a: '3',
      skill: '4+',
      s: '9',
      ap: '-2',
      d: '2',
    }),
  ],
  wargear_ability: [
    { id: 'wa-rf', ...loc({ name: 'Rapid Fire 1' }) },
    { id: 'wa-haz', ...loc({ name: 'Hazardous' }) },
    { id: 'wa-lh', ...loc({ name: 'LETHAL HITS: non-MONSTER/VEHICLE' }) },
  ],
  wargear_item_profile_wargear_ability: [
    { wargearItemProfileId: 'wp-br', wargearAbilityId: 'wa-rf', displayOrder: 1 },
    { wargearItemProfileId: 'wp-pi2', wargearAbilityId: 'wa-haz', displayOrder: 1 },
    { wargearItemProfileId: 'wp-sl', wargearAbilityId: 'wa-lh', displayOrder: 1 },
  ],
  wargear_option_group: [
    { id: 'g-int', datasheetId: 'ds-int' },
    { id: 'g-cap', datasheetId: 'ds-cap' },
    { id: 'g-boyz', datasheetId: 'ds-boyz' },
  ],
  wargear_option: [
    { id: 'o-br', wargearOptionGroupId: 'g-int', wargearItemId: 'wi-br' },
    { id: 'o-pi', wargearOptionGroupId: 'g-int', wargearItemId: 'wi-pi' },
    { id: 'o-cap-br', wargearOptionGroupId: 'g-cap', wargearItemId: 'wi-br' },
    { id: 'o-shield', wargearOptionGroupId: 'g-cap', wargearItemId: 'wi-shield' },
    { id: 'o-ch', wargearOptionGroupId: 'g-boyz', wargearItemId: 'wi-ch' },
    { id: 'o-sl', wargearOptionGroupId: 'g-boyz', wargearItemId: 'wi-sl' },
    { id: 'o-kl', wargearOptionGroupId: 'g-boyz', wargearItemId: 'wi-kl' },
  ],
  unit_composition: [
    { id: 'uc-int10', datasheetId: 'ds-int', isDefault: false, points: 160, displayOrder: 1 },
    { id: 'uc-int5', datasheetId: 'ds-int', isDefault: true, points: 80, displayOrder: 0 },
    { id: 'uc-cap', datasheetId: 'ds-cap', isDefault: true, points: 80, displayOrder: 0 },
    { id: 'uc-boyz', datasheetId: 'ds-boyz', isDefault: true, points: 85, displayOrder: 0 },
    { id: 'uc-boss', datasheetId: 'ds-boss', isDefault: true, points: 75, displayOrder: 0 },
  ],
  unit_composition_miniature: [
    { unitCompositionId: 'uc-int5', miniatureId: 'm-int', min: 4, max: 4 },
    { unitCompositionId: 'uc-int5', miniatureId: 'm-sgt', min: 1, max: 1 },
    { unitCompositionId: 'uc-int10', miniatureId: 'm-sgt', min: 1, max: 1 },
    { unitCompositionId: 'uc-int10', miniatureId: 'm-int', min: 9, max: 9 },
    { unitCompositionId: 'uc-cap', miniatureId: 'm-cap', min: 1, max: 1 },
    { unitCompositionId: 'uc-boyz', miniatureId: 'm-boy', min: 9, max: 9 },
    { unitCompositionId: 'uc-boyz', miniatureId: 'm-nob', min: 1, max: 1 },
    { unitCompositionId: 'uc-boss', miniatureId: 'm-boss', min: 1, max: 1 },
  ],
  base_miniature_loadout: [
    { id: 'bl-int', datasheetId: 'ds-int', miniatureId: 'm-int' },
    { id: 'bl-sgt', datasheetId: 'ds-int', miniatureId: 'm-sgt' },
    { id: 'bl-cap', datasheetId: 'ds-cap', miniatureId: 'm-cap' },
    { id: 'bl-boy', datasheetId: 'ds-boyz', miniatureId: 'm-boy' },
    { id: 'bl-nob', datasheetId: 'ds-boyz', miniatureId: 'm-nob' },
  ],
  base_miniature_loadout_wargear_option: [
    { baseMiniatureLoadoutId: 'bl-int', wargearOptionId: 'o-br', count: 1 },
    { baseMiniatureLoadoutId: 'bl-sgt', wargearOptionId: 'o-br', count: 1 },
    { baseMiniatureLoadoutId: 'bl-cap', wargearOptionId: 'o-cap-br', count: 1 },
    { baseMiniatureLoadoutId: 'bl-cap', wargearOptionId: 'o-shield', count: 1 },
    { baseMiniatureLoadoutId: 'bl-boy', wargearOptionId: 'o-ch', count: 1 },
    { baseMiniatureLoadoutId: 'bl-boy', wargearOptionId: 'o-sl', count: 1 },
    { baseMiniatureLoadoutId: 'bl-nob', wargearOptionId: 'o-kl', count: 1 },
    { baseMiniatureLoadoutId: 'bl-nob', wargearOptionId: 'o-sl', count: 1 },
  ],
  datasheet_bodyguard_group: [
    { id: 'bg-cap', bodyguardType: 'leader', datasheetId: 'ds-cap' },
    { id: 'bg-boss', bodyguardType: 'leader', datasheetId: 'ds-boss' },
  ],
  datasheet_bodyguard_group_datasheet: [
    { datasheetBodyguardGroupId: 'bg-cap', datasheetId: 'ds-int' },
  ],
  datasheet_bodyguard_group_keyword: [
    { datasheetBodyguardGroupId: 'bg-boss', keywordId: 'kw-mob' },
  ],
});

/** The script as 39k.pro serves it: code around the data object. */
export const sampleBundle = (tables: Record<string, unknown> = sampleTables()) =>
  `(function(){})();function Wd(e){return e}const Qd={data_version:972},Yd=${toJsLiteral(tables)},Vd={metadata:Qd,data:Yd},B=Vd.data;`;

export const SAMPLE_BUNDLE_URL = 'https://39k.pro/assets/index-47cf0977.js';
export const SAMPLE_HOME =
  '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-47cf0977.js"></script></head><body></body></html>';
```

- [ ] **Step 2: Write the failing test `apps/api/src/rules/extract.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { sampleBundle, sampleTables } from '../test/rules-sample';
import { extractUnits, readRulesBundle, RulesShapeError } from './extract';

describe('extractUnits', () => {
  const data = extractUnits(sampleTables());
  const sheet = (name: string) => data.datasheets.find((d) => d.name === name);

  it('names factions as the app does, chapters with their parent', () => {
    expect(data.factions).toEqual([
      { name: 'Adeptus Astartes', faction: 'Space Marines (Astartes)', parent: null },
      { name: 'Blood Angels', faction: 'Blood Angels', parent: 'Space Marines (Astartes)' },
      { name: 'Orks', faction: 'Orks', parent: null },
    ]);
  });

  it('leaves out Combat Patrol datasheets', () => {
    expect(data.datasheets.map((d) => d.name)).toEqual([
      'Intercessor Squad',
      'Captain',
      'Boyz',
      'Warboss',
    ]);
  });

  it('reads a squad: models (a hidden sergeant too), sizes smallest first, default loadout', () => {
    const squad = sheet('Intercessor Squad');
    expect(squad?.models).toEqual([
      { id: 'm-int', name: 'Intercessor', toughness: 4, save: 3, invuln: null, wounds: 2 },
      { id: 'm-sgt', name: 'Intercessor Sergeant', toughness: 4, save: 3, invuln: null, wounds: 2 },
    ]);
    expect(squad?.sizes).toEqual([
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
          { modelId: 'm-sgt', count: 1 },
          { modelId: 'm-int', count: 9 },
        ],
      },
    ]);
    expect(squad?.loadout).toEqual([
      { modelId: 'm-int', weaponId: 'wi-br', count: 1 },
      { modelId: 'm-sgt', weaponId: 'wi-br', count: 1 },
    ]);
    expect(squad?.keywords.sort()).toEqual(['INFANTRY', 'TACTICUS']);
    expect(squad?.abilities).toEqual([
      { name: 'Bolter Discipline', text: 'Re-roll a hit roll of 1.' },
    ]);
  });

  it('reads weapons with every profile and its keyword names, without other wargear', () => {
    expect(sheet('Intercessor Squad')?.weapons).toEqual([
      {
        id: 'wi-br',
        name: 'Bolt rifle',
        profiles: [
          {
            name: 'Bolt rifle',
            melee: false,
            range: '24"',
            attacks: '2',
            skill: 3,
            strength: 4,
            ap: -1,
            damage: '1',
            keywords: ['Rapid Fire 1'],
          },
        ],
      },
      {
        id: 'wi-pi',
        name: 'Plasma incinerator',
        profiles: [
          {
            name: 'Standard',
            melee: false,
            range: '24"',
            attacks: '2',
            skill: 3,
            strength: 7,
            ap: -2,
            damage: '1',
            keywords: [],
          },
          {
            name: 'Supercharge',
            melee: false,
            range: '24"',
            attacks: '2',
            skill: 3,
            strength: 8,
            ap: -3,
            damage: '2',
            keywords: ['Hazardous'],
          },
        ],
      },
    ]);
    expect(sheet('Captain')?.weapons.map((w) => w.name)).toEqual(['Bolt rifle']);
  });

  it('reads invulnerable saves (for the unit or one model), Feel No Pain, Stealth and Damaged', () => {
    expect(sheet('Captain')?.models[0]?.invuln).toBe(4);
    expect(sheet('Warboss')).toMatchObject({ fnp: 6, damaged: 3, stealth: false });
    expect(sheet('Warboss')?.models[0]?.invuln).toBe(5);
    expect(sheet('Boyz')).toMatchObject({ stealth: true, fnp: null, damaged: null });
  });

  it('knows which units a character can lead, by name or by keyword', () => {
    expect(sheet('Captain')?.leads).toEqual(['ds-int']);
    expect(sheet('Warboss')?.leads).toEqual(['ds-boyz']);
    expect(sheet('Intercessor Squad')?.leads).toEqual([]);
  });

  it('names a missing table', () => {
    const tables = sampleTables();
    delete tables.unit_composition;
    expect(() => extractUnits(tables)).toThrow('39k.pro data has no unit_composition');
  });
});

describe('readRulesBundle', () => {
  it('finds the data in the script and its version', () => {
    const { dataVersion, data } = readRulesBundle(sampleBundle());
    expect(dataVersion).toBe(972);
    expect(data.datasheets).toHaveLength(4);
  });

  it('says when the data isn’t there', () => {
    expect(() => readRulesBundle('console.log(1)')).toThrow(RulesShapeError);
    expect(() => readRulesBundle('console.log(1)')).toThrow(/No rules data/);
  });

  it('refuses code where data should be', () => {
    expect(() => readRulesBundle('const a={publication:load()}')).toThrow(/couldn’t be read/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run --project api apps/api/src/rules/extract.test.ts`
Expected: FAIL (modules or behaviour not there yet).

- [ ] **Step 4: Write `apps/api/src/rules/extract.ts`**

```ts
import {
  canonicalArmy,
  cleanRulesText,
  UnitDataSchema,
  type UnitData,
  type UnitDatasheet,
  type UnitModel,
  type UnitProfile,
  type UnitWeapon,
} from '@bcp/shared';
import { readJsLiteral } from './js-literal';

/** Bump when the extraction changes: a site holding data read the old way reads it again. */
export const RULES_FORMAT = 1;

/** 39k.pro's data wasn't where or what it should be: the site changed. */
export class RulesShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesShapeError';
  }
}

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Tables every read needs; the others may be missing. */
const REQUIRED = [
  'publication',
  'faction_keyword',
  'datasheet',
  'datasheet_faction_keyword',
  'miniature',
  'miniature_keyword',
  'keyword',
  'datasheet_ability',
  'datasheet_datasheet_ability',
  'wargear_option_group',
  'wargear_option',
  'wargear_item',
  'wargear_item_profile',
  'wargear_ability',
  'wargear_item_profile_wargear_ability',
  'unit_composition',
  'unit_composition_miniature',
  'base_miniature_loadout',
  'base_miniature_loadout_wargear_option',
  'datasheet_bodyguard_group',
  'datasheet_bodyguard_group_datasheet',
];

const field = (row: Row, key: string): string | null => {
  const value = row[key];
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null;
};
const en = (row: Row): Row => {
  const all = row.localisations;
  const english = isRow(all) ? all.en : undefined;
  return isRow(english) ? english : {};
};
const enText = (row: Row, key: string) => cleanRulesText(field(en(row), key));
const byOrder = (a: Row, b: Row) => Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0);
const unique = <T>(values: T[]) => [...new Set(values)];
/** "3+" → 3, "12" → 12, "-" → null. */
const number = (text: string | null): number | null => {
  const match = /^\s*(-?\d+)\+?\s*$/.exec(text ?? '');
  return match === null ? null : Number(match[1]);
};

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const value = field(row, key);
    if (value === null) continue;
    const list = groups.get(value);
    if (list === undefined) groups.set(value, [row]);
    else list.push(row);
  }
  return groups;
}

/** GW-app tables from 39k.pro → the English unit data Mathhammer uses. */
export function extractUnits(tables: Record<string, unknown>): UnitData {
  const table = (name: string): Row[] => {
    const value = tables[name];
    const rows = Array.isArray(value) ? value.filter(isRow) : [];
    if (rows.length === 0 && REQUIRED.includes(name)) {
      throw new RulesShapeError(`39k.pro data has no ${name}`);
    }
    return rows;
  };
  for (const name of REQUIRED) table(name);

  const patrol = new Set(
    table('publication')
      .filter((p) => p.isCombatPatrol === true)
      .map((p) => field(p, 'id')),
  );
  const kept = (row: Row) =>
    row.isCombatPatrol !== true && !patrol.has(field(row, 'publicationId'));

  // Factions, as the app names them.
  const factionKeywords = table('faction_keyword');
  const appFaction = new Map<string, string>();
  for (const keyword of factionKeywords) {
    const id = field(keyword, 'id');
    const common = enText(keyword, 'commonName');
    const faction =
      canonicalArmy(enText(keyword, 'name')) ?? (common === '' ? null : canonicalArmy(common));
    if (id !== null && faction !== null) appFaction.set(id, faction);
  }
  const factionsOf = (ids: (string | null)[]) =>
    unique(ids.flatMap((id) => (id === null ? [] : [appFaction.get(id) ?? ''])))
      .filter((faction) => faction !== '')
      .sort();
  const factions = factionKeywords.flatMap((keyword) => {
    const faction = appFaction.get(field(keyword, 'id') ?? '');
    if (faction === undefined || keyword.excludedFromArmyBuilder === true) return [];
    const parentId = field(keyword, 'parentFactionKeywordId');
    const parent = parentId === null ? null : (appFaction.get(parentId) ?? null);
    return [{ name: enText(keyword, 'name'), faction, parent: parent === faction ? null : parent }];
  });

  // Lookups.
  const datasheetFactions = groupBy(table('datasheet_faction_keyword'), 'datasheetId');
  const miniatures = groupBy(table('miniature'), 'datasheetId');
  const modelKeywords = groupBy(table('miniature_keyword'), 'miniatureId');
  const keywordName = new Map(table('keyword').map((k) => [field(k, 'id'), enText(k, 'name')]));
  const invulnerable = groupBy(table('invulnerable_save'), 'datasheetId');
  const damagedRows = groupBy(table('datasheet_damage'), 'datasheetId');
  const ability = new Map(table('datasheet_ability').map((a) => [field(a, 'id'), a]));
  const abilityLinks = groupBy(table('datasheet_datasheet_ability'), 'datasheetId');
  const items = new Map(table('wargear_item').map((item) => [field(item, 'id'), item]));
  const profileRows = groupBy(table('wargear_item_profile'), 'wargearItemId');
  const weaponAbility = new Map(
    table('wargear_ability').map((a) => [field(a, 'id'), enText(a, 'name')]),
  );
  const profileAbilities = groupBy(
    table('wargear_item_profile_wargear_ability'),
    'wargearItemProfileId',
  );
  const optionById = new Map(table('wargear_option').map((o) => [field(o, 'id'), o]));
  const compositions = groupBy(table('unit_composition'), 'datasheetId');
  const compositionModels = groupBy(table('unit_composition_miniature'), 'unitCompositionId');
  const baseLoadouts = groupBy(table('base_miniature_loadout'), 'datasheetId');
  const baseLoadoutOptions = groupBy(
    table('base_miniature_loadout_wargear_option'),
    'baseMiniatureLoadoutId',
  );
  const bodyguardGroups = groupBy(table('datasheet_bodyguard_group'), 'datasheetId');
  const bodyguardDatasheets = groupBy(
    table('datasheet_bodyguard_group_datasheet'),
    'datasheetBodyguardGroupId',
  );
  const bodyguardKeywords = groupBy(
    table('datasheet_bodyguard_group_keyword'),
    'datasheetBodyguardGroupId',
  );

  /** Item ids a datasheet can take, through a choice table chain (set → choice → item). */
  const chain = (
    setTable: string,
    choiceTable: string,
    setKey: string,
    itemTable: string,
    choiceKey: string,
  ) => {
    const choices = groupBy(table(choiceTable), setKey);
    const choiceItems = groupBy(table(itemTable), choiceKey);
    const sets = groupBy(table(setTable), 'datasheetId');
    return (datasheetId: string) =>
      (sets.get(datasheetId) ?? []).flatMap((set) =>
        (choices.get(field(set, 'id') ?? '') ?? []).flatMap((choice) =>
          (choiceItems.get(field(choice, 'id') ?? '') ?? []).map((row) =>
            field(row, 'wargearItemId'),
          ),
        ),
      );
  };
  const optionGroups = groupBy(table('wargear_option_group'), 'datasheetId');
  const options = groupBy(table('wargear_option'), 'wargearOptionGroupId');
  const itemSources = [
    (datasheetId: string) =>
      (optionGroups.get(datasheetId) ?? []).flatMap((group) =>
        (options.get(field(group, 'id') ?? '') ?? []).map((row) => field(row, 'wargearItemId')),
      ),
    chain(
      'loadout_choice_set',
      'loadout_choice',
      'loadoutChoiceSetId',
      'loadout_choice_wargear_item',
      'loadoutChoiceId',
    ),
    chain(
      'all_model_wargear_choice_set',
      'all_model_wargear_choice',
      'allModelWargearChoiceSetId',
      'all_model_wargear_choice_wargear_item',
      'allModelWargearChoiceId',
    ),
    chain(
      'limited_wargear_choice_set',
      'limited_wargear_choice',
      'limitedWargearChoiceSetId',
      'limited_wargear_choice_wargear_item',
      'limitedWargearChoiceId',
    ),
  ];

  const profileOf = (row: Row): UnitProfile => {
    const melee = field(row, 'type') === 'melee';
    return {
      name: enText(row, 'name'),
      melee,
      range: field(row, 'range'),
      attacks: field(row, 'attacks') ?? '1',
      skill: number(
        melee
          ? (field(row, 'weaponSkill') ?? field(row, 'ballisticSkill'))
          : field(row, 'ballisticSkill'),
      ),
      strength: number(field(row, 'strength')),
      ap: number(field(row, 'armourPenetration')) ?? 0,
      damage: field(row, 'damage') ?? '1',
      keywords: [...(profileAbilities.get(field(row, 'id') ?? '') ?? [])]
        .sort(byOrder)
        .map((link) => weaponAbility.get(field(link, 'wargearAbilityId')) ?? '')
        .filter((name) => name !== ''),
    };
  };
  const weaponOf = (id: string, item: Row): UnitWeapon => ({
    id,
    name: enText(item, 'name'),
    profiles: [...(profileRows.get(id) ?? [])].sort(byOrder).map(profileOf),
  });

  // Datasheets.
  const kinds = new Map<string, string[]>(); // datasheet id → upper-case keywords
  const sheets = table('datasheet').filter(kept);
  for (const sheet of sheets) {
    const id = field(sheet, 'id') ?? '';
    kinds.set(
      id,
      unique(
        (miniatures.get(id) ?? []).flatMap((model) =>
          (modelKeywords.get(field(model, 'id') ?? '') ?? []).map((link) =>
            (keywordName.get(field(link, 'keywordId')) ?? '').toUpperCase(),
          ),
        ),
      ).filter((k) => k !== ''),
    );
  }
  const factionsById = new Map(
    sheets.map((sheet) => {
      const id = field(sheet, 'id') ?? '';
      return [
        id,
        factionsOf((datasheetFactions.get(id) ?? []).map((r) => field(r, 'factionKeywordId'))),
      ];
    }),
  );
  /** Units a character can lead or support: listed ones, and those with a listed keyword. */
  const bodyguardsOf = (id: string, type: string): string[] => {
    const mine = factionsById.get(id) ?? [];
    return unique(
      (bodyguardGroups.get(id) ?? [])
        .filter((group) => field(group, 'bodyguardType') === type)
        .flatMap((group) => {
          const groupId = field(group, 'id') ?? '';
          const listed = (bodyguardDatasheets.get(groupId) ?? []).map(
            (row) => field(row, 'datasheetId') ?? '',
          );
          const wanted = (bodyguardKeywords.get(groupId) ?? []).map((row) =>
            (keywordName.get(field(row, 'keywordId')) ?? '').toUpperCase(),
          );
          const byKeyword =
            wanted.length === 0
              ? []
              : [...kinds.entries()]
                  .filter(
                    ([other, keywords]) =>
                      other !== id &&
                      wanted.some((k) => keywords.includes(k)) &&
                      (factionsById.get(other) ?? []).some((f) => mine.includes(f)),
                  )
                  .map(([other]) => other);
          return [...listed, ...byKeyword];
        })
        .filter((other) => other !== '' && kinds.has(other)),
    );
  };

  const datasheets = sheets.map((sheet): UnitDatasheet => {
    const id = field(sheet, 'id') ?? '';
    const invulns = invulnerable.get(id) ?? [];
    const unitInvuln = number(
      field(invulns.find((r) => field(r, 'miniatureId') === null) ?? {}, 'save'),
    );
    const models: UnitModel[] = [...(miniatures.get(id) ?? [])]
      .sort(byOrder)
      // A hidden statline (a sergeant shown with the squad) is still a model of the unit.
      .flatMap((model) => {
        const modelId = field(model, 'id') ?? '';
        const toughness = number(field(model, 'toughness'));
        const wounds = number(field(model, 'wounds'));
        if (toughness === null || wounds === null) return [];
        const own = number(
          field(invulns.find((r) => field(r, 'miniatureId') === modelId) ?? {}, 'save'),
        );
        return [
          {
            id: modelId,
            name: enText(model, 'name'),
            toughness,
            save: number(field(model, 'save')) ?? 7,
            invuln: own ?? unitInvuln,
            wounds,
          },
        ];
      });
    const modelIds = new Set(models.map((m) => m.id));
    const sizes = [...(compositions.get(id) ?? [])]
      .sort(byOrder)
      .map((composition) => ({
        points: typeof composition.points === 'number' ? composition.points : null,
        models: (compositionModels.get(field(composition, 'id') ?? '') ?? [])
          .map((row) => ({ modelId: field(row, 'miniatureId') ?? '', count: Number(row.min ?? 0) }))
          .filter((m) => modelIds.has(m.modelId) && m.count > 0),
      }))
      .filter((size) => size.models.length > 0)
      .sort(
        (a, b) =>
          a.models.reduce((s, m) => s + m.count, 0) - b.models.reduce((s, m) => s + m.count, 0),
      );
    const loadout = (baseLoadouts.get(id) ?? []).flatMap((base) => {
      const modelId = field(base, 'miniatureId') ?? '';
      return (baseLoadoutOptions.get(field(base, 'id') ?? '') ?? []).flatMap((row) => {
        const itemId = field(optionById.get(field(row, 'wargearOptionId')) ?? {}, 'wargearItemId');
        const item = items.get(itemId);
        if (itemId === null || item === undefined || field(item, 'wargearType') !== 'weapon') {
          return [];
        }
        return [{ modelId, weaponId: itemId, count: Number(row.count ?? 1) }];
      });
    });
    const weaponIds = unique([
      ...loadout.map((l) => l.weaponId),
      ...itemSources.flatMap((source) => source(id)),
    ]).filter((itemId): itemId is string => itemId !== null);
    const weapons = weaponIds.flatMap((itemId) => {
      const item = items.get(itemId);
      return item !== undefined && field(item, 'wargearType') === 'weapon'
        ? [weaponOf(itemId, item)]
        : [];
    });
    const linked = [...(abilityLinks.get(id) ?? [])].sort(byOrder).flatMap((link) => {
      const row = ability.get(field(link, 'datasheetAbilityId'));
      return row === undefined ? [] : [row];
    });
    const coreNames = linked
      .filter((row) => field(row, 'abilityType') === 'core')
      .map((row) => enText(row, 'name'));
    const fnps = coreNames.flatMap((name) => {
      const match = /^Feel No Pain (\d)\+/i.exec(name);
      return match === null ? [] : [Number(match[1])];
    });
    const damagedCore = coreNames.flatMap((name) => {
      const match = /^Damaged (\d+)/i.exec(name);
      return match === null ? [] : [Number(match[1])];
    });
    const damagedText = (damagedRows.get(id) ?? []).flatMap((row) => {
      const match = /1-(\d+) wounds/i.exec(`${enText(row, 'name')} ${enText(row, 'rules')}`);
      return match === null ? [] : [Number(match[1])];
    });
    return {
      id,
      name: enText(sheet, 'name'),
      legends: sheet.isLegends === true,
      factions: factionsById.get(id) ?? [],
      keywords: kinds.get(id) ?? [],
      models,
      sizes,
      loadout,
      weapons,
      fnp: fnps.length > 0 ? Math.min(...fnps) : null,
      stealth: coreNames.some((name) => /^Stealth$/i.test(name)),
      damaged: damagedCore[0] ?? damagedText[0] ?? null,
      abilities: linked
        .filter(
          (row) => field(row, 'abilityType') !== 'core' && field(row, 'abilityType') !== 'faction',
        )
        .map((row) => ({ name: enText(row, 'name'), text: enText(row, 'rules') })),
      leads: bodyguardsOf(id, 'leader'),
      supports: bodyguardsOf(id, 'support'),
    };
  });

  return { factions, datasheets: datasheets.filter((d) => d.models.length > 0) };
}

/** Finds 39k.pro's data in its script, reads it as text (never runs it) and extracts the units. */
export function readRulesBundle(script: string): { dataVersion: number | null; data: UnitData } {
  const at = script.indexOf('{publication:');
  if (at < 0) {
    throw new RulesShapeError('No rules data found in 39k.pro’s script (the site changed)');
  }
  let value: unknown;
  try {
    value = readJsLiteral(script, at).value;
  } catch (error) {
    throw new RulesShapeError(
      `39k.pro’s rules data couldn’t be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRow(value)) throw new RulesShapeError('39k.pro’s rules data isn’t an object');
  const version = /data_version:(\d+)/.exec(script.slice(Math.max(0, at - 200), at));
  const parsed = UnitDataSchema.safeParse(extractUnits(value));
  if (!parsed.success) throw new RulesShapeError('39k.pro’s rules data has an unexpected shape');
  return {
    dataVersion: version?.[1] === undefined ? null : Number(version[1]),
    data: parsed.data,
  };
}
```

- [ ] **Step 5: Run the tests and checks**

Run: `pnpm vitest run --project api apps/api/src/rules/extract.test.ts`
Expected: PASS (the files above hold 10 tests).
Then: `pnpm typecheck && pnpm exec eslint <the files above>` → no errors.

- [ ] **Step 6: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add apps/api/src/rules/extract.test.ts apps/api/src/rules/extract.ts apps/api/src/test/rules-sample.ts
git commit -m "feat: extract datasheets, loadouts, sizes and leader links from 39k.pro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Storing and syncing the unit data

**Files:**

- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/test-db.ts`
- Create: `apps/api/drizzle/0015_rules.sql`
- Create: `apps/api/drizzle/meta/0015_snapshot.json`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/src/repo/rules.ts`
- Test: `apps/api/src/repo/rules.test.ts`

**Interfaces:**

- Consumes: Tasks 2–3.
- Produces: table `rulesSnapshot`; `syncRules(db, client, now, format?)`, `rulesStatus(db)`, `rulesDue(db, now)`, `loadUnits(db): { readAt; data } | null`.

- [ ] **Step 1: Write the failing test `apps/api/src/repo/rules.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import type { RulesClient } from '../rules/client';
import { SAMPLE_HOME, sampleBundle, sampleTables } from '../test/rules-sample';
import { loadUnits, rulesDue, rulesStatus, syncRules } from './rules';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const NOW = new Date('2026-10-04T10:00:00Z');
const LATER = new Date('2026-10-05T10:00:00Z');

/** A fake 39k.pro whose home page names `script`; counts bundle downloads. */
function fakeSite(script = '/assets/index-aaa.js', bundle = sampleBundle()) {
  const downloads: string[] = [];
  const client: RulesClient = {
    homePage: () => Promise.resolve(SAMPLE_HOME.replace('/assets/index-47cf0977.js', script)),
    bundle: (url) => {
      downloads.push(url);
      return Promise.resolve(bundle);
    },
  };
  return { client, downloads };
}

describe('syncRules', () => {
  it('reads the rules, stores them and says what it has', async () => {
    const status = await syncRules(db, fakeSite().client, NOW);
    expect(status).toEqual({
      checkedAt: NOW.toISOString(),
      readAt: NOW.toISOString(),
      bundle: 'https://39k.pro/assets/index-aaa.js',
      dataVersion: 972,
      counts: { factions: 3, datasheets: 4, weapons: 6 },
      error: null,
    });
    const loaded = await loadUnits(db);
    expect(loaded?.readAt.toISOString()).toBe(NOW.toISOString());
    expect(loaded?.data.datasheets.map((d) => d.name)).toEqual([
      'Intercessor Squad',
      'Captain',
      'Boyz',
      'Warboss',
    ]);
  });

  it('skips a script it has already read', async () => {
    const site = fakeSite();
    await syncRules(db, site.client, NOW);
    const status = await syncRules(db, site.client, LATER);
    expect(site.downloads).toHaveLength(1);
    expect(status.readAt).toBe(NOW.toISOString());
    expect(status.checkedAt).toBe(LATER.toISOString());
  });

  it('reads the same script again when the way rules are read changed', async () => {
    const site = fakeSite();
    await syncRules(db, site.client, NOW, 0);
    await syncRules(db, site.client, LATER, 0);
    expect(site.downloads).toHaveLength(1);
    const status = await syncRules(db, site.client, LATER, 1);
    expect(site.downloads).toHaveLength(2);
    expect(status.readAt).toBe(LATER.toISOString());
  });

  it('keeps the old rules when a new script can’t be read, and says why', async () => {
    await syncRules(db, fakeSite().client, NOW);
    const status = await syncRules(
      db,
      fakeSite('/assets/index-bbb.js', 'nothing here').client,
      LATER,
    );
    expect(status.error).toMatch(/No rules data/);
    expect(status.readAt).toBe(NOW.toISOString());
    expect((await loadUnits(db))?.data.datasheets).toHaveLength(4);
  });

  it('records a failed download, and clears the error once a read works', async () => {
    const down: RulesClient = {
      homePage: () => Promise.reject(new Error('39k.pro answered 503')),
      bundle: () => Promise.reject(new Error('unused')),
    };
    expect((await syncRules(db, down, NOW)).error).toBe('39k.pro answered 503');
    expect((await syncRules(db, fakeSite().client, LATER)).error).toBeNull();
  });

  it('picks up a new script with new data', async () => {
    await syncRules(db, fakeSite().client, NOW);
    const tables = sampleTables();
    const datasheets = tables.datasheet ?? [];
    tables.datasheet = datasheets.map((row) =>
      (row as { id: string }).id === 'ds-boss'
        ? { ...(row as object), localisations: { en: { name: 'Big Boss' } } }
        : row,
    );
    await syncRules(db, fakeSite('/assets/index-ccc.js', sampleBundle(tables)).client, LATER);
    expect((await loadUnits(db))?.data.datasheets.map((d) => d.name)).toContain('Big Boss');
  });
});

describe('rulesStatus and rulesDue', () => {
  it('knows nothing before the first read', async () => {
    expect(await rulesStatus(db)).toEqual({
      checkedAt: null,
      readAt: null,
      bundle: null,
      dataVersion: null,
      counts: null,
      error: null,
    });
    expect(await loadUnits(db)).toBeNull();
  });

  it('is due when never checked or checked a day ago', async () => {
    expect(await rulesDue(db, NOW)).toBe(true);
    await syncRules(db, fakeSite().client, NOW);
    expect(await rulesDue(db, new Date('2026-10-05T09:59:00Z'))).toBe(false);
    expect(await rulesDue(db, LATER)).toBe(true);
  });

  it('is due at once when the rules were read the old way', async () => {
    await syncRules(db, fakeSite().client, NOW, 0);
    expect(await rulesDue(db, new Date('2026-10-04T11:00:00Z'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project api apps/api/src/repo/rules.test.ts`
Expected: FAIL (modules or behaviour not there yet).

- [ ] **Step 3: Write `apps/api/src/repo/rules.ts`**

```ts
import { UnitDataSchema, type RulesStatus, type UnitData } from '@bcp/shared';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { appSettings, rulesSnapshot } from '../db/schema';
import { bundleUrlOf, type RulesClient } from '../rules/client';
import { readRulesBundle, RULES_FORMAT } from '../rules/extract';

const CHECKED_AT = 'rulesCheckedAt';
/** Why the last check failed; absent when it worked. */
const ERROR = 'rulesError';
/** The RULES_FORMAT the stored rules were read with, as `v2` (a bare "2" reads back as a number). */
const FORMAT = 'rulesFormat';
const DAY_MS = 86_400_000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function setting(db: Db, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return typeof row?.value === 'string' ? row.value : null;
}

async function putSetting(db: Db, key: string, value: string | null, now: Date): Promise<void> {
  if (value === null) {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return;
  }
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}

const count = (name: string) =>
  sql<number>`jsonb_array_length(${rulesSnapshot.data} -> ${sql.raw(`'${name}'`)})::int`;

/** What rules data is stored, when it was read and checked, and the last check's error. */
export async function rulesStatus(db: Db): Promise<RulesStatus> {
  const [checkedAt, error, rows] = await Promise.all([
    setting(db, CHECKED_AT),
    setting(db, ERROR),
    db
      .select({
        readAt: rulesSnapshot.readAt,
        bundle: rulesSnapshot.bundle,
        dataVersion: rulesSnapshot.dataVersion,
        factions: count('factions'),
        datasheets: count('datasheets'),
        weapons: sql<number>`(select coalesce(sum(jsonb_array_length(sheet -> 'weapons')), 0)::int from jsonb_array_elements(${rulesSnapshot.data} -> 'datasheets') as sheet)`,
      })
      .from(rulesSnapshot),
  ]);
  const row = rows[0];
  return {
    checkedAt,
    readAt: row?.readAt.toISOString() ?? null,
    bundle: row?.bundle ?? null,
    dataVersion: row?.dataVersion ?? null,
    counts:
      row === undefined
        ? null
        : {
            factions: row.factions,
            datasheets: row.datasheets,
            weapons: row.weapons,
          },
    error,
  };
}

/**
 * True when 39k.pro hasn't been checked in the last 24 hours, or no rules are stored the current
 * way (never read, or read before RULES_FORMAT changed): those are checked at once (hourly).
 */
export async function rulesDue(db: Db, now: Date): Promise<boolean> {
  const [at, format] = await Promise.all([setting(db, CHECKED_AT), setting(db, FORMAT)]);
  if (format !== `v${String(RULES_FORMAT)}`) return true;
  return at === null || now.getTime() - Date.parse(at) >= DAY_MS;
}

/**
 * Checks 39k.pro: when its script changed (or RULES_FORMAT did), reads it and replaces the stored rules. Any
 * failure (download, a changed shape) keeps the old rules and is recorded as the error.
 */
export async function syncRules(
  db: Db,
  client: RulesClient,
  now: Date,
  format = RULES_FORMAT,
): Promise<RulesStatus> {
  let error: string | null = null;
  try {
    const bundle = bundleUrlOf(await client.homePage());
    const [stored] = await db.select({ bundle: rulesSnapshot.bundle }).from(rulesSnapshot);
    const storedFormat = await setting(db, FORMAT);
    if (stored?.bundle !== bundle || storedFormat !== `v${String(format)}`) {
      const { dataVersion, data } = readRulesBundle(await client.bundle(bundle));
      const values = { bundle, dataVersion, readAt: now, data };
      await db
        .insert(rulesSnapshot)
        .values({ id: 1, ...values })
        .onConflictDoUpdate({ target: rulesSnapshot.id, set: values });
      await putSetting(db, FORMAT, `v${String(format)}`, now);
    }
  } catch (caught) {
    error = messageOf(caught);
  }
  await putSetting(db, ERROR, error, now);
  await putSetting(db, CHECKED_AT, now.toISOString(), now);
  return rulesStatus(db);
}

/** The stored data, read once per version (it is a few MB). */
const cache = new WeakMap<Db, { key: string; readAt: Date; data: UnitData }>();

/** The stored unit data and when it was read, or null before the first read. */
export async function loadUnits(db: Db): Promise<{ readAt: Date; data: UnitData } | null> {
  const [head] = await db
    .select({ readAt: rulesSnapshot.readAt, bundle: rulesSnapshot.bundle })
    .from(rulesSnapshot);
  if (head === undefined) return null;
  const key = `${head.readAt.toISOString()} ${head.bundle}`;
  const cached = cache.get(db);
  if (cached?.key === key) return cached;
  const [row] = await db.select({ data: rulesSnapshot.data }).from(rulesSnapshot);
  if (row === undefined) return null;
  const parsed = UnitDataSchema.safeParse(row.data);
  // Data stored in an older shape: as if not read yet (the next check reads it again).
  if (!parsed.success) return null;
  const loaded = { key, readAt: head.readAt, data: parsed.data };
  cache.set(db, loaded);
  return loaded;
}
```

- [ ] **Step 4: Change `apps/api/src/db/schema.ts`** (apply with `git apply` or by hand)

```diff
diff --git a/apps/api/src/db/schema.ts b/apps/api/src/db/schema.ts
index d34a32d..01f1dd1 100644
--- a/apps/api/src/db/schema.ts
+++ b/apps/api/src/db/schema.ts
@@ -1,4 +1,4 @@
-import type { ApiErrorCode } from '@bcp/shared';
+import type { ApiErrorCode, UnitData } from '@bcp/shared';
 import { desc, sql } from 'drizzle-orm';
 import {
   boolean,
@@ -385,3 +385,17 @@ export const gameUpdates = pgTable('game_updates', {
   hidden: boolean('hidden').notNull().default(false),
   updatedAt: timestamptz('updated_at').notNull().defaultNow(),
 });
+
+/** The unit data read from 39k.pro (one row): replaced whole by each successful read. */
+export const rulesSnapshot = pgTable(
+  'rules_snapshot',
+  {
+    id: integer('id').primaryKey().default(1),
+    /** The script's address the data came from; the same address isn't read again. */
+    bundle: text('bundle').notNull(),
+    dataVersion: integer('data_version'),
+    readAt: timestamptz('read_at').notNull(),
+    data: jsonb('data').$type<UnitData>().notNull(),
+  },
+  (t) => [check('rules_snapshot_single_row', sql`${t.id} = 1`)],
+);
```

- [ ] **Step 5: Change `apps/api/src/db/test-db.ts`** (apply with `git apply` or by hand)

```diff
diff --git a/apps/api/src/db/test-db.ts b/apps/api/src/db/test-db.ts
index 53ed3c2..90206bb 100644
--- a/apps/api/src/db/test-db.ts
+++ b/apps/api/src/db/test-db.ts
@@ -10,6 +10,6 @@ export async function createTestDb(): Promise<{ db: Db; close: () => Promise<voi

 export async function resetDb(db: Db): Promise<void> {
   await db.execute(
-    sql`truncate events, teams, players, army_lists, team_matchups, games, sync_runs, bcp_session, fetch_queue, sessions, users, app_settings, detachment_links, bsdata_detachments, bsdata_files, detachment_keeps, bsdata_commits, game_updates restart identity cascade`,
+    sql`truncate events, teams, players, army_lists, team_matchups, games, sync_runs, bcp_session, fetch_queue, sessions, users, app_settings, detachment_links, bsdata_detachments, bsdata_files, detachment_keeps, bsdata_commits, game_updates, rules_snapshot restart identity cascade`,
   );
 }
```

- [ ] **Step 6: Generate the migration**

In `apps/api`: `pnpm exec drizzle-kit generate --name rules`
Expected: `drizzle/0015_rules.sql` creating `rules_snapshot` (id integer primary key default 1, bundle, data_version, read_at, data jsonb, check `id = 1`) and its meta snapshot.

- [ ] **Step 7: Run the tests and checks**

Run: `pnpm vitest run --project api apps/api/src/repo/rules.test.ts`
Expected: PASS (the files above hold 9 tests).
Then: `pnpm typecheck && pnpm exec eslint <the files above>` → no errors.

- [ ] **Step 8: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add apps/api/drizzle/0015_rules.sql apps/api/drizzle/meta/0015_snapshot.json apps/api/drizzle/meta/_journal.json apps/api/src/db/schema.ts apps/api/src/db/test-db.ts apps/api/src/repo/rules.test.ts apps/api/src/repo/rules.ts
git commit -m "feat: keep the last good unit data from 39k.pro, read daily

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rules and Mathhammer API, daily read

**Files:**

- Create: `apps/api/src/routes/rules.ts`
- Create: `apps/api/src/routes/mathhammer.ts`
- Test: `apps/api/src/routes/rules.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `playwright.config.ts`

**Interfaces:**

- Consumes: Task 4.
- Produces: `GET /api/rules`, `POST /api/rules/refresh` (admin when logins are on), `GET /api/mathhammer/factions`, `GET /api/mathhammer/units?faction=` (404 with “refresh it in Settings” before the first read); `AppDeps.rules`; `config.RULES_ENABLED`.

- [ ] **Step 1: Write the failing test `apps/api/src/routes/rules.test.ts`**

```ts
import type { MathhammerUnits, RulesStatus } from '@bcp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import type { RulesClient } from '../rules/client';
import { SyncRunner } from '../sync/runner';
import { ALL_EVENTS, sampleSource, silentLogger, testFetchQueue } from '../test/helpers';
import { SAMPLE_HOME, sampleBundle } from '../test/rules-sample';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
});

const client: RulesClient = {
  homePage: () => Promise.resolve(SAMPLE_HOME),
  bundle: () => Promise.resolve(sampleBundle()),
};

const appWith = (rules?: RulesClient) => {
  const source = sampleSource();
  return createApp({
    db,
    runner: new SyncRunner({ db, source, logger: silentLogger, eventRule: ALL_EVENTS }),
    fetchQueue: testFetchQueue(db, source),
    bcpStatus: () =>
      Promise.resolve({
        source: 'fixtures',
        state: 'fixtures',
        accessTokenExpiresAt: null,
        lastRefreshAt: null,
      }),
    logger: silentLogger,
    eventRule: ALL_EVENTS,
    now: () => new Date('2026-10-04T10:00:00Z'),
    ...(rules === undefined ? {} : { rules }),
  });
};

describe('rules routes', () => {
  it('answers the status, and reads 39k.pro on Refresh', async () => {
    const app = appWith(client);
    expect(await (await app.request('/api/rules')).json()).toMatchObject({
      readAt: null,
      counts: null,
    });
    const response = await app.request('/api/rules/refresh', { method: 'POST' });
    expect(response.status).toBe(200);
    const status = (await response.json()) as RulesStatus;
    expect(status.counts).toEqual({ factions: 3, datasheets: 4, weapons: 6 });
  });

  it('says when 39k.pro reading isn’t set up', async () => {
    expect((await appWith().request('/api/rules/refresh', { method: 'POST' })).status).toBe(404);
  });

  it('answers factions and a faction’s units once the data is read', async () => {
    const app = appWith(client);
    expect((await app.request('/api/mathhammer/factions')).status).toBe(404);
    await app.request('/api/rules/refresh', { method: 'POST' });
    expect(await (await app.request('/api/mathhammer/factions')).json()).toEqual({
      factions: [
        { faction: 'Orks', units: 2 },
        { faction: 'Space Marines (Astartes)', units: 2 },
      ],
    });
    const units = (await (
      await app.request('/api/mathhammer/units?faction=Orks')
    ).json()) as MathhammerUnits;
    expect(units.datasheets.map((d) => d.name)).toEqual(['Boyz', 'Warboss']);
    expect((await app.request('/api/mathhammer/units?faction=Nobody')).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project api apps/api/src/routes/rules.test.ts`
Expected: FAIL (modules or behaviour not there yet).

- [ ] **Step 3: Write `apps/api/src/routes/rules.ts`**

```ts
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { ForbiddenError, NotFoundError } from '../errors';
import { rulesStatus, syncRules } from '../repo/rules';
import type { RulesClient } from '../rules/client';

/** Settings → Rules data: its status, and Refresh (with logins on, admins only). */
export function rulesRoutes(deps: {
  db: Db;
  client: RulesClient | undefined;
  authRequired: boolean;
  now: () => Date;
}) {
  const { db } = deps;
  return new Hono<AuthEnv>()
    .get('/rules', async (c) => c.json(await rulesStatus(db)))
    .post('/rules/refresh', async (c) => {
      if (deps.authRequired && c.get('user')?.role !== 'admin') {
        throw new ForbiddenError('Only admins can refresh the rules data');
      }
      if (deps.client === undefined) throw new NotFoundError('Reading 39k.pro isn’t set up here');
      return c.json(await syncRules(db, deps.client, deps.now()));
    });
}
```

- [ ] **Step 4: Write `apps/api/src/routes/mathhammer.ts`**

```ts
import { factionFamily, type UnitData } from '@bcp/shared';
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { loadUnits } from '../repo/rules';

async function unitData(db: Db): Promise<UnitData> {
  const loaded = await loadUnits(db);
  if (loaded === null) {
    throw new NotFoundError(
      'The unit data from 39k.pro hasn’t been read yet: refresh it in Settings',
    );
  }
  return loaded.data;
}

/** The factions with units, and a faction's datasheets, for Mathhammer's pickers. */
export function mathhammerRoutes(deps: { db: Db }) {
  return new Hono<AuthEnv>()
    .get('/mathhammer/factions', async (c) => {
      const data = await unitData(deps.db);
      const names = [...new Set(data.datasheets.flatMap((d) => d.factions))].sort((a, b) =>
        a.localeCompare(b),
      );
      return c.json({
        factions: names.map((faction) => {
          const family = factionFamily(faction, data.factions);
          return {
            faction,
            units: data.datasheets.filter((d) => d.factions.some((f) => family.includes(f))).length,
          };
        }),
      });
    })
    .get('/mathhammer/units', async (c) => {
      const data = await unitData(deps.db);
      const faction = c.req.query('faction') ?? '';
      if (!data.datasheets.some((d) => d.factions.includes(faction))) {
        throw new NotFoundError(`No units for “${faction}”`);
      }
      const family = factionFamily(faction, data.factions);
      return c.json({
        faction,
        datasheets: data.datasheets
          .filter((d) => d.factions.some((f) => family.includes(f)))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    });
}
```

- [ ] **Step 5: Change `apps/api/src/app.ts`** (apply with `git apply` or by hand)

```diff
diff --git a/apps/api/src/app.ts b/apps/api/src/app.ts
index a34fed9..9e00470 100644
--- a/apps/api/src/app.ts
+++ b/apps/api/src/app.ts
@@ -18,6 +18,8 @@ import { fetchQueueRoutes } from './routes/fetch-queue';
 import { matchupsRoutes } from './routes/matchups';
 import { metaRoutes } from './routes/meta';
 import { bsdataRoutes } from './routes/bsdata';
+import { mathhammerRoutes } from './routes/mathhammer';
+import { rulesRoutes } from './routes/rules';
 import { gameUpdateRoutes } from './routes/game-updates';
 import { playersSearchRoutes } from './routes/players-search';
 import { rankingsRoutes } from './routes/rankings';
@@ -25,6 +27,7 @@ import { syncRoutes } from './routes/sync';
 import { userRoutes } from './routes/users';
 import type { SyncRunner } from './sync/runner';
 import type { BsdataClient } from './bsdata/client';
+import type { RulesClient } from './rules/client';

 export interface AppDeps {
   db: Db;
@@ -44,6 +47,8 @@ export interface AppDeps {
   autoFetch?: AutoFetchPlanner;
   /** BSData on GitHub, for detachments; Refresh answers 404 without it. */
   bsdata?: BsdataClient;
+  /** 39k.pro, for Mathhammer's unit data; Refresh answers 404 without it. */
+  rules?: RulesClient;
 }

 const LOGIN_WINDOW_MS = 15 * 60 * 1000;
@@ -124,6 +129,11 @@ export function createApp(deps: AppDeps) {
     '/api',
     bsdataRoutes({ db: deps.db, client: deps.bsdata, authRequired: auth.required, now }),
   );
+  app.route(
+    '/api',
+    rulesRoutes({ db: deps.db, client: deps.rules, authRequired: auth.required, now }),
+  );
+  app.route('/api', mathhammerRoutes({ db: deps.db }));
   app.route('/api', gameUpdateRoutes({ db: deps.db, authRequired: auth.required, now }));
   app.route(
     '/api',
```

- [ ] **Step 6: Change `apps/api/src/config.ts`** (apply with `git apply` or by hand)

```diff
diff --git a/apps/api/src/config.ts b/apps/api/src/config.ts
index 8718b8e..39a2e27 100644
--- a/apps/api/src/config.ts
+++ b/apps/api/src/config.ts
@@ -33,6 +33,11 @@ const EnvSchema = z.object({
     .enum(['true', 'false', '1', '0'])
     .default('true')
     .transform((value) => value === 'true' || value === '1'),
+  /** Reading Mathhammer's unit data from 39k.pro once a day; false switches it off. */
+  RULES_ENABLED: z
+    .enum(['true', 'false', '1', '0'])
+    .default('true')
+    .transform((value) => value === 'true' || value === '1'),
   /** How often the planner looks for missing events, pairings and lists. */
   AUTO_FETCH_INTERVAL_MS: z.coerce.number().int().min(1000).default(600_000),
   /** Only events that started within this many days are fetched automatically. */
```

- [ ] **Step 7: Change `apps/api/src/main.ts`** (apply with `git apply` or by hand)

```diff
diff --git a/apps/api/src/main.ts b/apps/api/src/main.ts
index 653f918..3b16888 100644
--- a/apps/api/src/main.ts
+++ b/apps/api/src/main.ts
@@ -12,6 +12,8 @@ import { reparseLists, tidyDetachments } from './repo/lists';
 import { bsdataDue, syncBsdata } from './repo/bsdata';
 import { syncUpdateCommits } from './repo/game-updates';
 import { httpBsdataClient } from './bsdata/client';
+import { httpRulesClient } from './rules/client';
+import { rulesDue, syncRules } from './repo/rules';
 import { backfillPlayerUserIds } from './repo/player-accounts';
 import { failInterruptedSyncRuns } from './repo/sync-runs';
 import { serveWebApp } from './static';
@@ -90,6 +92,26 @@ const syncBsdataIfDue = async () => {
 void syncBsdataIfDue();
 const bsdataTimer = setInterval(() => void syncBsdataIfDue(), 60 * 60 * 1000);

+// 39k.pro (Mathhammer's unit data): checked hourly, read again once a day.
+const rules = config.RULES_ENABLED ? httpRulesClient() : undefined;
+const syncRulesIfDue = async () => {
+  if (rules === undefined) return;
+  try {
+    if (await rulesDue(database.db, new Date())) {
+      const status = await syncRules(database.db, rules, new Date());
+      if (status.error === null) {
+        logger.info({ dataVersion: status.dataVersion }, 'Read the unit data from 39k.pro');
+      } else {
+        logger.warn({ error: status.error }, 'Could not read the unit data from 39k.pro');
+      }
+    }
+  } catch (error) {
+    logger.warn({ err: error }, 'Unit data check failed; will try again');
+  }
+};
+void syncRulesIfDue();
+const rulesTimer = setInterval(() => void syncRulesIfDue(), 60 * 60 * 1000);
+
 const app = createApp({
   db: database.db,
   runner,
@@ -100,6 +122,7 @@ const app = createApp({
   allowedHosts: allowedHostsOf(config),
   autoFetch,
   bsdata,
+  rules,
   auth: { required: config.AUTH_REQUIRED, secret: config.SESSION_SECRET ?? '' },
 });
 if (config.WEB_DIST_DIR !== undefined) serveWebApp(app, config.WEB_DIST_DIR);
@@ -114,6 +137,7 @@ async function shutdown(signal: string): Promise<void> {
   logger.info({ signal }, 'Shutting down');
   server.close();
   clearInterval(bsdataTimer);
+  clearInterval(rulesTimer);
   await autoFetch?.stop();
   // Let a list fetch in flight finish writing before the database closes.
   await fetchQueue.stop();
```

- [ ] **Step 8: Change `playwright.config.ts`** (apply with `git apply` or by hand)

```diff
diff --git a/playwright.config.ts b/playwright.config.ts
index fa14a81..70d96db 100644
--- a/playwright.config.ts
+++ b/playwright.config.ts
@@ -30,6 +30,7 @@ export default defineConfig({
         AUTO_FETCH_ENABLED: 'false',
         // No GitHub downloads in e2e: they'd re-tidy fixture lists mid-run.
         BSDATA_ENABLED: 'false',
+        RULES_ENABLED: 'false',
         // The sample fixtures are tiny (8 players, 2 rounds): keep the size rule from filtering them out.
         MIN_EVENT_ROUNDS: '0',
         MIN_EVENT_PLAYERS: '0',
```

- [ ] **Step 9: Run the tests and checks**

Run: `pnpm vitest run --project api apps/api/src/routes/rules.test.ts`
Expected: PASS (the files above hold 3 tests).
Then: `pnpm typecheck && pnpm exec eslint <the files above>` → no errors.

- [ ] **Step 10: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add apps/api/src/app.ts apps/api/src/config.ts apps/api/src/main.ts apps/api/src/routes/mathhammer.ts apps/api/src/routes/rules.test.ts apps/api/src/routes/rules.ts playwright.config.ts
git commit -m "feat: rules data and Mathhammer unit routes, read from 39k.pro daily

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Settings → Rules data card

**Files:**

- Create: `apps/web/src/features/settings/rules-queries.ts`
- Create: `apps/web/src/features/settings/RulesCard.tsx`
- Test: `apps/web/src/features/settings/RulesCard.test.tsx`
- Modify: `apps/web/src/routes/settings.tsx`

**Interfaces:**

- Consumes: `RulesStatusSchema`, `GET /api/rules`, `POST /api/rules/refresh`.
- Produces: `rulesQuery`, `refreshRules()`, `RulesCard`.

- [ ] **Step 1: Write the failing test `apps/web/src/features/settings/RulesCard.test.tsx`**

```tsx
import type { RulesStatus } from '@bcp/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDateTime } from '../../lib/format';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { authOff } from '../auth/auth-test-utils';
import { RulesCard } from './RulesCard';

const status = (overrides: Partial<RulesStatus> = {}): RulesStatus => ({
  checkedAt: '2026-10-04T10:00:00.000Z',
  readAt: '2026-10-03T10:00:00.000Z',
  bundle: 'https://39k.pro/assets/index-47cf0977.js',
  dataVersion: 972,
  counts: { factions: 34, datasheets: 1056, weapons: 4576 },
  error: 'No rules data found in 39k.pro’s script (the site changed)',
  ...overrides,
});

describe('RulesCard', () => {
  it('shows what was read, when, and the last error', async () => {
    stubFetchRoutes({ 'GET /api/auth/me': authOff, 'GET /api/rules': status() });
    renderWithProviders(<RulesCard />);
    expect(
      await screen.findByText('34 factions · 1056 datasheets · 4576 weapons'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Read ${formatDateTime('2026-10-03T10:00:00.000Z')} · data version 972`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Checked ${formatDateTime('2026-10-04T10:00:00.000Z')}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Last check failed: No rules data found in 39k.pro’s script (the site changed)',
      ),
    ).toBeInTheDocument();
  });

  it('refreshes on request', async () => {
    const fetchMock = stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'POST /api/rules/refresh': status({ error: null }),
      'GET /api/rules': status(),
    });
    renderWithProviders(<RulesCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Last check failed/)).not.toBeInTheDocument();
    });
  });

  it('says when nothing has been read yet', async () => {
    stubFetchRoutes({
      'GET /api/auth/me': authOff,
      'GET /api/rules': status({
        checkedAt: null,
        readAt: null,
        bundle: null,
        dataVersion: null,
        counts: null,
        error: null,
      }),
    });
    renderWithProviders(<RulesCard />);
    expect(await screen.findByText('Not read from 39k.pro yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run --project web apps/web/src/features/settings/RulesCard.test.tsx`
Expected: FAIL (modules or behaviour not there yet).

- [ ] **Step 3: Write `apps/web/src/features/settings/rules-queries.ts`**

```ts
import { RulesStatusSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../api/client';

export const rulesQuery = queryOptions({
  queryKey: ['rules'],
  queryFn: () => apiGet('/api/rules', RulesStatusSchema),
});

/** Checks 39k.pro now (admins, when logins are on). */
export const refreshRules = () => apiPost('/api/rules/refresh', {}, RulesStatusSchema);
```

- [ ] **Step 4: Write `apps/web/src/features/settings/RulesCard.tsx`**

```tsx
import { Anchor, Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { formatDateTime, plural } from '../../lib/format';
import { meQuery } from '../auth/auth-queries';
import { refreshRules, rulesQuery } from './rules-queries';

/** Mathhammer's unit data from 39k.pro: what was read, when, and the last check's error. */
export function RulesCard() {
  const status = useQuery(rulesQuery);
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: refreshRules,
    onSuccess: (data) => {
      queryClient.setQueryData(rulesQuery.queryKey, data);
    },
  });
  const readOnly = me.data?.authRequired === true && me.data.user?.role !== 'admin';
  const data = status.data;

  return (
    <Panel title="Rules data">
      {status.isPending && <Skeleton height={56} />}
      {status.error && <ErrorState error={status.error} onRetry={() => void status.refetch()} />}
      {data && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Datasheets and weapons for Mathhammer, from{' '}
            <Anchor href="https://39k.pro" target="_blank" inherit>
              39k.pro
            </Anchor>
            . Checked again once a day.
          </Text>
          {data.readAt === null || data.counts === null ? (
            <Text size="sm">Not read from 39k.pro yet.</Text>
          ) : (
            <>
              <Text size="sm" className="numeric">
                {`${plural(data.counts.factions, 'faction')} · ${plural(data.counts.datasheets, 'datasheet')} · ${plural(data.counts.weapons, 'weapon')}`}
              </Text>
              <Text size="sm" c="dimmed">
                {`Read ${formatDateTime(data.readAt)}${data.dataVersion === null ? '' : ` · data version ${String(data.dataVersion)}`}`}
              </Text>
            </>
          )}
          {data.checkedAt !== null && (
            <Text size="sm" c="dimmed">{`Checked ${formatDateTime(data.checkedAt)}`}</Text>
          )}
          {data.error !== null && (
            <Text size="sm" c="red">{`Last check failed: ${data.error}`}</Text>
          )}
          {refresh.error && (
            <Text size="sm" c="red">
              {refresh.error.message}
            </Text>
          )}
          <Group>
            <Button
              size="xs"
              variant="outline"
              loading={refresh.isPending}
              disabled={readOnly}
              onClick={() => {
                refresh.mutate();
              }}
            >
              Refresh
            </Button>
            {readOnly && (
              <Text size="xs" c="dimmed">
                Only admins can refresh the rules data
              </Text>
            )}
          </Group>
        </Stack>
      )}
    </Panel>
  );
}
```

- [ ] **Step 5: Change `apps/web/src/routes/settings.tsx`** (apply with `git apply` or by hand)

```diff
diff --git a/apps/web/src/routes/settings.tsx b/apps/web/src/routes/settings.tsx
index 307d5e6..6b30e53 100644
--- a/apps/web/src/routes/settings.tsx
+++ b/apps/web/src/routes/settings.tsx
@@ -3,6 +3,7 @@ import { createFileRoute } from '@tanstack/react-router';
 import { FetchQueueCard } from '../features/fetch-queue/FetchQueueCard';
 import { AutoFetchCard } from '../features/settings/AutoFetchCard';
 import { BsdataCard } from '../features/settings/BsdataCard';
+import { RulesCard } from '../features/settings/RulesCard';
 import { UpdatesSection } from '../features/updates/UpdatesSection';
 import { BcpStatusCard } from '../features/settings/BcpStatusCard';
 import { DetachmentNamesCard } from '../features/settings/DetachmentNamesCard';
@@ -23,6 +24,7 @@ function SettingsPage() {
             <AutoFetchCard />
             <BsdataCard />
             <UpdatesSection />
+            <RulesCard />
             <UsersCard />
           </Stack>
         </Grid.Col>
```

- [ ] **Step 6: Run the tests and checks**

Run: `pnpm vitest run --project web apps/web/src/features/settings/RulesCard.test.tsx`
Expected: PASS (the files above hold 3 tests).
Then: `pnpm typecheck && pnpm exec eslint <the files above>` → no errors.

- [ ] **Step 7: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add apps/web/src/features/settings/RulesCard.test.tsx apps/web/src/features/settings/RulesCard.tsx apps/web/src/features/settings/rules-queries.ts apps/web/src/routes/settings.tsx
git commit -m "feat: Settings card for Mathhammer’s unit data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Picking units on the page

**Files:**

- Create: `apps/web/src/features/mathhammer/unit-fixtures.ts`
- Create: `apps/web/src/features/mathhammer/datasheet-form.ts`
- Test: `apps/web/src/features/mathhammer/datasheet-form.test.ts`
- Create: `apps/web/src/features/mathhammer/best.ts`
- Test: `apps/web/src/features/mathhammer/best.test.ts`
- Create: `apps/web/src/features/mathhammer/mathhammer-queries.ts`
- Create: `apps/web/src/features/mathhammer/UnitPicker.tsx`
- Create: `apps/web/src/features/mathhammer/SwitchesEditor.tsx`
- Modify: `apps/web/src/features/mathhammer/form-state.ts`
- Modify: `apps/web/src/features/mathhammer/form-state.test.ts`
- Modify: `apps/web/src/features/mathhammer/inputs.tsx`
- Modify: `apps/web/src/features/mathhammer/WeaponEditor.tsx`
- Modify: `apps/web/src/features/mathhammer/AttackerPanel.tsx`
- Modify: `apps/web/src/features/mathhammer/DefenderPanel.tsx`
- Modify: `apps/web/src/features/mathhammer/ResultPanel.tsx`
- Modify: `apps/web/src/features/mathhammer/MathhammerPage.tsx`
- Modify: `apps/web/src/features/mathhammer/MathhammerPage.test.tsx`

**Interfaces:**

- Consumes: Task 1 (`readKeywords`, unit types, schemas), Task 5 routes.
- Produces: form fields `source`, `phase`, weapon `profiles`/`profile`/`keywordNames`/`own`; `sitsOut(form, row)`; `toCalculation(form, chosen?)`; `attackerRows(sheet, size, attached)`, `defenderFrom(sheet, size, attached, previous)`; `calculateForm(form): Outcome` (with `best` names); `UnitPicker`, `SwitchesEditor`.

- [ ] **Step 1: Write the test helper `apps/web/src/features/mathhammer/unit-fixtures.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test `apps/web/src/features/mathhammer/form-state.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { defaultForm, newWeapon, sitsOut, toCalculation, type MathhammerForm } from './form-state';

const read = (form: MathhammerForm) => toCalculation(form);

describe('toCalculation', () => {
  it('turns the starting setup into a calculation', () => {
    const result = read(defaultForm());
    if (!('calculation' in result)) throw new Error(result.error);
    const { weapons, defender } = result.calculation;
    expect(weapons[0]).toMatchObject({
      name: 'Bolt rifle',
      models: 5,
      attacks: '2',
      ap: -1,
      heavy: true,
    });
    expect(defender.keywords).toEqual(['INFANTRY', 'ORKS']);
    expect(defender.groups[0]).toEqual({
      name: 'Boyz',
      models: 10,
      toughness: 5,
      save: 5,
      invuln: null,
      wounds: 1,
      fnp: null,
      character: false,
    });
  });

  it('adds a weapon’s keywords to the unit’s switches', () => {
    const form = defaultForm();
    const weapon = form.weapons[0];
    if (weapon === undefined) throw new Error('no weapon');
    form.weapons = [{ ...weapon, twinLinked: true, sustainedHits: '1', anti: 'infantry 4+' }];
    const result = read(form);
    if (!('calculation' in result)) throw new Error(result.error);
    expect(result.calculation.weapons[0]?.mods).toMatchObject({
      woundReroll: 'failures',
      sustainedHits: '1',
    });
    expect(result.calculation.weapons[0]?.anti).toEqual([{ keyword: 'INFANTRY', value: 4 }]);
  });

  it('says what it can’t read', () => {
    const form = defaultForm();
    const weapon = form.weapons[0];
    if (weapon === undefined) throw new Error('no weapon');
    form.weapons = [{ ...weapon, attacks: '2Q', anti: 'infantry' }];
    const result = read(form);
    expect('error' in result && result.error).toMatch(/Bolt rifle attacks: can’t read “2Q”/);
    expect('error' in result && result.error).toMatch(/can’t read Anti/);
    expect(read({ ...defaultForm(), defender: { ...defaultForm().defender, groups: [] } })).toEqual(
      {
        error: 'Add at least one kind of model to the target',
      },
    );
  });
});

describe('sitsOut', () => {
  const rifle = { ...newWeapon(), name: 'Bolt rifle', models: 5 };
  const pistol = {
    ...newWeapon(),
    name: 'Bolt pistol',
    models: 5,
    keywordNames: ['CLOSE-QUARTERS'],
  };
  const fists = { ...newWeapon(), name: 'Fists', models: 5, melee: true };
  const form: MathhammerForm = { ...defaultForm(), weapons: [rifle, pistol, fists] };

  it('shooting uses guns, pistols only when there are no other guns', () => {
    expect(form.weapons.map((w) => sitsOut(form, w))).toEqual([
      null,
      'Not used: the models fire their other guns',
      'Not used when shooting',
    ]);
    const pistolsOnly = { ...form, weapons: [pistol, fists] };
    expect(sitsOut(pistolsOnly, pistol)).toBeNull();
  });

  it('fighting uses melee weapons only, and the calculation leaves the rest out', () => {
    const fighting = { ...form, phase: 'fighting' as const };
    expect(fighting.weapons.map((w) => sitsOut(fighting, w))).toEqual([
      'Not used when fighting',
      'Not used when fighting',
      null,
    ]);
    const read = toCalculation(fighting);
    expect('calculation' in read && read.calculation.weapons.map((w) => w.name)).toEqual(['Fists']);
  });
});
```

- [ ] **Step 3: Write the failing test `apps/web/src/features/mathhammer/datasheet-form.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { attackerRows, defenderFrom } from './datasheet-form';
import { defaultForm } from './form-state';
import { CAPTAIN, INTERCESSORS } from './unit-fixtures';

describe('attackerRows', () => {
  it('counts every model carrying each weapon of the default loadout', () => {
    const rows = attackerRows(INTERCESSORS, 0, []);
    expect(rows.map((r) => [r.name, r.models, r.profile])).toEqual([
      ['Bolt rifle', 5, 0],
      ['Plasma gun', 1, 'best'],
    ]);
    expect(rows[0]).toMatchObject({
      attacks: '2',
      skill: 3,
      strength: 4,
      ap: -1,
      keywordNames: ['Rapid Fire 1'],
    });
    expect(attackerRows(INTERCESSORS, 1, [])[0]?.models).toBe(10);
  });

  it('adds attached characters’ weapons, named after them', () => {
    const rows = attackerRows(INTERCESSORS, 0, [CAPTAIN]);
    expect(rows.at(-1)).toMatchObject({
      name: 'Captain: Master-crafted power weapon',
      models: 1,
      melee: true,
    });
  });
});

describe('defenderFrom', () => {
  it('makes one row per profile, a Character row per leader, and keeps the switches', () => {
    const previous = { ...defaultForm().defender, damageReduction: 1 };
    const defender = defenderFrom(INTERCESSORS, 0, [CAPTAIN], previous);
    expect(defender.groups.map((g) => [g.name, g.models, g.invuln, g.fnp, g.character])).toEqual([
      ['Intercessor / Intercessor Sergeant', 5, null, null, false],
      ['Captain', 1, 4, 6, true],
    ]);
    expect(defender).toMatchObject({
      source: 'Intercessor Squad + Captain',
      attached: true,
      keywords: 'INFANTRY, CHARACTER',
      damageReduction: 1,
    });
  });
});
```

- [ ] **Step 4: Write the failing test `apps/web/src/features/mathhammer/best.test.ts`**

```ts
import type { UnitProfile } from '@bcp/shared';
import { describe, expect, it } from 'vitest';
import { calculateForm } from './best';
import { defaultForm, newGroup, newWeapon, toCalculation, type MathhammerForm } from './form-state';

const profile = (p: Partial<UnitProfile> & Pick<UnitProfile, 'name'>): UnitProfile => ({
  melee: false,
  range: '24"',
  attacks: '1',
  skill: 3,
  strength: 4,
  ap: 0,
  damage: '1',
  keywords: [],
  ...p,
});

/** A weapon with a many-shot and a single big-shot profile, set to Best, into `groups`. */
function setup(models: number, wounds: number, save: number): MathhammerForm {
  const form = defaultForm();
  return {
    ...form,
    weapons: [
      {
        ...newWeapon(),
        name: 'Gun',
        profile: 'best',
        profiles: [
          profile({ name: 'Rapid', attacks: '3' }),
          profile({ name: 'Heavy shot', strength: 8, ap: -3, damage: '3' }),
        ],
      },
    ],
    defender: { ...form.defender, keywords: '', groups: [{ ...newGroup(), models, wounds, save }] },
  };
}

describe('calculateForm', () => {
  it('picks the profile that slays most against this target', () => {
    const weak = setup(10, 1, 7);
    const strong = setup(1, 3, 2);
    const weakResult = calculateForm(weak);
    const strongResult = calculateForm(strong);
    const key = weak.weapons[0]?.key ?? '';
    expect('best' in weakResult && weakResult.best[key]).toBe('Rapid');
    expect('best' in strongResult && strongResult.best[strong.weapons[0]?.key ?? '']).toBe(
      'Heavy shot',
    );
  });
});

describe('toCalculation with datasheet weapons', () => {
  it('reads the weapon’s ability names against the target', () => {
    const form = defaultForm();
    const gun = {
      ...newWeapon(),
      keywordNames: ['LETHAL HITS: non-MONSTER/VEHICLE'],
      profiles: [profile({ name: 'Gun' })],
    };
    const infantry = toCalculation({ ...form, weapons: [gun] });
    const tank = toCalculation({
      ...form,
      weapons: [gun],
      defender: { ...form.defender, keywords: 'VEHICLE' },
    });
    expect('calculation' in infantry && infantry.calculation.weapons[0]?.mods.lethalHits).toBe(
      true,
    );
    expect('calculation' in tank && tank.calculation.weapons[0]?.mods.lethalHits).toBe(false);
  });

  it('uses a weapon’s own switches instead of the unit’s', () => {
    const form = defaultForm();
    const own = { ...newWeapon(), own: { ...form.unit, hitModifier: 1 } };
    const read = toCalculation({ ...form, weapons: [own, newWeapon()] });
    if (!('calculation' in read)) throw new Error(read.error);
    expect(read.calculation.weapons.map((w) => w.mods.hitModifier)).toEqual([1, 0]);
  });
});
```

- [ ] **Step 5: Write the failing test `apps/web/src/features/mathhammer/MathhammerPage.test.tsx`**

```tsx
import { calculate } from '@bcp/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { CAPTAIN, INTERCESSORS } from './unit-fixtures';
import { defaultForm, toCalculation } from './form-state';
import { MathhammerPage } from './MathhammerPage';
import { percent } from './ResultPanel';

/** The engine's average models slain for a form, as the page shows it. */
function expectedSlain(change: (form: ReturnType<typeof defaultForm>) => void): string {
  const form = defaultForm();
  change(form);
  const read = toCalculation(form);
  if (!('calculation' in read)) throw new Error(read.error);
  return calculate(read.calculation).averages.modelsSlain.toFixed(2);
}

const weapon = () => within(screen.getByRole('group', { name: 'Weapon 1' }));

describe('MathhammerPage', () => {
  it('shows the result of the starting setup', () => {
    renderWithProviders(<MathhammerPage />);
    expect(screen.getByLabelText('Models slain')).toHaveTextContent(expectedSlain(() => undefined));
    expect(screen.getByRole('table', { name: 'Models slain, at least' })).toBeInTheDocument();
  });

  it('recalculates when a weapon changes', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.change(weapon().getByLabelText('Attacks'), { target: { value: '4' } });
    const want = expectedSlain((form) => {
      const first = form.weapons[0];
      if (first !== undefined) form.weapons = [{ ...first, attacks: '4' }];
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('waits for a number while a minus sign is typed', async () => {
    renderWithProviders(<MathhammerPage />);
    const ap = weapon().getByLabelText('AP');
    fireEvent.change(ap, { target: { value: '-' } });
    expect(ap).toHaveValue('-');
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(
        expectedSlain(() => undefined),
      );
    });
    fireEvent.change(ap, { target: { value: '-2' } });
    const want = expectedSlain((form) => {
      const first = form.weapons[0];
      if (first !== undefined) form.weapons = [{ ...first, ap: -2 }];
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('keeps typed numbers within the field’s limits', async () => {
    renderWithProviders(<MathhammerPage />);
    const models = within(screen.getByRole('group', { name: 'Models 1' }));
    fireEvent.change(models.getByLabelText('Sv'), { target: { value: '1' } });
    const want = expectedSlain((form) => {
      const first = form.defender.groups[0];
      if (first !== undefined) form.defender.groups = [{ ...first, save: 2 }];
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('applies the situation', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByLabelText('In cover (-1 BS for ranged)'));
    const want = expectedSlain((form) => {
      form.situation = { ...form.situation, cover: true };
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Models slain')).toHaveTextContent(want);
    });
  });

  it('says what it can’t read', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.change(weapon().getByLabelText('D'), { target: { value: 'D7' } });
    expect(await screen.findByText('Can’t calculate')).toBeInTheDocument();
    expect(screen.getByText(/Bolt rifle damage: can’t read “D7”/)).toBeInTheDocument();
  });

  it('shows the leader’s chance once a Character is added', async () => {
    renderWithProviders(<MathhammerPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Add models' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Models 2' })).getByLabelText('Character'),
    );
    expect(await screen.findByText('Leader slain')).toBeInTheDocument();
    expect(screen.getByText(/^Allocation: /)).toBeInTheDocument();
  });
});

describe('percent', () => {
  it('never rounds a real chance to 0% or 100%', () => {
    expect(percent(0.623)).toBe('62%');
    expect(percent(0.001)).toBe('<1%');
    expect(percent(0.999)).toBe('>99%');
    expect(percent(1)).toBe('100%');
    expect(percent(0)).toBe('0%');
  });
});

describe('picking units', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const choose = async (label: string, option: string) => {
    fireEvent.click(await screen.findByRole('combobox', { name: label }));
    fireEvent.click(await screen.findByRole('option', { name: option }));
  };

  it('fills the attacker from a datasheet with an attached leader', async () => {
    stubFetchRoutes({
      'GET /api/mathhammer/factions': {
        factions: [{ faction: 'Space Marines (Astartes)', units: 2 }],
      },
      'GET /api/mathhammer/units': {
        faction: 'Space Marines (Astartes)',
        datasheets: [CAPTAIN, INTERCESSORS],
      },
    });
    renderWithProviders(<MathhammerPage />);
    await choose('Attacker faction', 'Space Marines (Astartes)');
    await choose('Attacker unit', 'Intercessor Squad');
    await choose('Attached characters', 'Captain');
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(
      await screen.findByText('From datasheet: Intercessor Squad + Captain'),
    ).toBeInTheDocument();
    expect(weapon().getByLabelText('Weapon')).toHaveValue('Bolt rifle');
    expect(weapon().getByLabelText('Models')).toHaveValue('5');
    const plasma = within(screen.getByRole('group', { name: 'Weapon 2' }));
    expect(plasma.getByRole('combobox', { name: 'Profile' })).toHaveValue('Best');
    expect(await plasma.findByText(/^Best here: /)).toBeInTheDocument();
    const captain = within(screen.getByRole('group', { name: 'Weapon 3' }));
    expect(captain.getByLabelText('Weapon')).toHaveValue('Captain: Master-crafted power weapon');
  });

  it('says when the unit data hasn’t been read', async () => {
    stubFetchRoutes({
      'GET /api/mathhammer/factions': () =>
        Response.json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'The unit data from 39k.pro hasn’t been read yet: refresh it in Settings',
            },
          },
          { status: 404 },
        ),
    });
    renderWithProviders(<MathhammerPage />);
    expect((await screen.findAllByText(/refresh it in Settings/)).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer/`
Expected: FAIL (modules or behaviour not there yet).

- [ ] **Step 7: Write `apps/web/src/features/mathhammer/form-state.ts`**

```ts
import {
  buildWeapon,
  DEFAULT_MODS,
  parseAnti,
  parseDice,
  readKeywords,
  type Calculation,
  type Situation,
  type UnitProfile,
  type WeaponKeywords,
  type WeaponMods,
} from '@bcp/shared';

/** One weapon as typed: its profile and its keywords. */
export interface WeaponRow {
  key: string;
  name: string;
  models: number;
  melee: boolean;
  attacks: string;
  /** BS/WS (3 for 3+); null for weapons without one (Torrent). */
  skill: number | null;
  strength: number;
  ap: number;
  damage: string;
  torrent: boolean;
  lethalHits: boolean;
  /** Sustained Hits X ("" = none). */
  sustainedHits: string;
  devastatingWounds: boolean;
  twinLinked: boolean;
  heavy: boolean;
  lance: boolean;
  ignoresCover: boolean;
  precision: boolean;
  indirectFire: boolean;
  /** Rapid Fire X ("" = none). */
  rapidFire: string;
  blast: number | null;
  cleave: number | null;
  melta: number | null;
  /** "INFANTRY 4+, VEHICLE 3+" ("" = none). */
  anti: string;
  /** A datasheet weapon's profiles (empty when typed by hand). */
  profiles: UnitProfile[];
  /** The profile used: its index, or 'best' (the one that slays most against the target). */
  profile: number | 'best';
  /** The chosen profile's ability names from the datasheet, read against the target. */
  keywordNames: string[];
  /** The weapon's own switches instead of the unit's; null to use the unit's. */
  own: WeaponMods | null;
}

/** One kind of model in the target. */
export interface GroupRow {
  key: string;
  name: string;
  models: number;
  toughness: number;
  save: number;
  invuln: number | null;
  wounds: number;
  fnp: number | null;
  character: boolean;
}

export interface DefenderForm {
  /** The datasheet it was filled from, for the "from datasheet" line; null when typed. */
  source: string | null;
  groups: GroupRow[];
  /** Comma-separated, for Anti-X. */
  keywords: string;
  attached: boolean;
  stealth: boolean;
  hitModifier: number;
  woundModifier: number;
  damageReduction: number;
  halveDamage: boolean;
  savePenaltiesIgnored: boolean;
}

export interface MathhammerForm {
  /** The datasheet the attacker was filled from; null when typed. */
  source: string | null;
  /** Shooting counts ranged weapons, Fighting melee ones. */
  phase: 'shooting' | 'fighting';
  weapons: WeaponRow[];
  /** The attacking unit's switches, for all its weapons. */
  unit: WeaponMods;
  defender: DefenderForm;
  situation: Situation;
  /** Mortal wounds after all weapons ("" = none). */
  flatMortals: string;
}

export const NO_SITUATION: Situation = {
  movedOver3: false,
  halfRange: false,
  charged: false,
  plungingFire: false,
  snapShooting: false,
  indirectShooting: false,
  indirectStationaryVisible: false,
  attackerDamaged: false,
  cover: false,
  armourOfContempt: false,
};

let counter = 0;
const nextKey = () => {
  counter += 1;
  return `row-${String(counter)}`;
};

export const newWeapon = (): WeaponRow => ({
  key: nextKey(),
  name: 'Weapon',
  models: 1,
  melee: false,
  attacks: '1',
  skill: 3,
  strength: 4,
  ap: 0,
  damage: '1',
  torrent: false,
  lethalHits: false,
  sustainedHits: '',
  devastatingWounds: false,
  twinLinked: false,
  heavy: false,
  lance: false,
  ignoresCover: false,
  precision: false,
  indirectFire: false,
  rapidFire: '',
  blast: null,
  cleave: null,
  melta: null,
  anti: '',
  profiles: [],
  profile: 0,
  keywordNames: [],
  own: null,
});

export const newGroup = (): GroupRow => ({
  key: nextKey(),
  name: 'Models',
  models: 5,
  toughness: 4,
  save: 3,
  invuln: null,
  wounds: 1,
  fnp: null,
  character: false,
});

/** A setup to start from: five bolt rifles into ten Boyz. */
export function defaultForm(): MathhammerForm {
  return {
    source: null,
    phase: 'shooting',
    weapons: [{ ...newWeapon(), name: 'Bolt rifle', models: 5, attacks: '2', ap: -1, heavy: true }],
    unit: DEFAULT_MODS,
    defender: {
      source: null,
      groups: [{ ...newGroup(), name: 'Boyz', models: 10, toughness: 5, save: 5 }],
      keywords: 'INFANTRY, ORKS',
      attached: false,
      stealth: false,
      hitModifier: 0,
      woundModifier: 0,
      damageReduction: 0,
      halveDamage: false,
      savePenaltiesIgnored: false,
    },
    situation: NO_SITUATION,
    flatMortals: '',
  };
}

const optional = (text: string) => (text.trim() === '' ? null : text.trim());

/** The form as an engine calculation, or what can't be read in it. */
const CLOSE_QUARTERS = /^(close-quarters|pistol)$/i;

/**
 * Why a weapon sits out this phase, or null when it attacks: Shooting uses ranged weapons and
 * Fighting melee ones; a datasheet's close-quarters weapons (pistols) sit out while the unit has
 * other ranged weapons, as each model fires one or the other.
 */
export function sitsOut(form: MathhammerForm, row: WeaponRow): string | null {
  if (form.phase === 'fighting') return row.melee ? null : 'Not used when fighting';
  if (row.melee) return 'Not used when shooting';
  const closeQuarters = (w: WeaponRow) => w.keywordNames.some((k) => CLOSE_QUARTERS.test(k.trim()));
  if (!closeQuarters(row)) return null;
  const others = form.weapons.some((w) => !w.melee && w.models > 0 && !closeQuarters(w));
  return others ? 'Not used: the models fire their other guns' : null;
}

/** A row's profile values: its own fields, or for 'best' the profile being tried. */
function statsOf(row: WeaponRow, chosen: number): WeaponRow {
  if (row.profile !== 'best') return row;
  const p = row.profiles[chosen] ?? row.profiles[0];
  if (p === undefined) return row;
  return {
    ...row,
    melee: p.melee,
    attacks: p.attacks,
    skill: p.skill,
    strength: p.strength ?? row.strength,
    ap: p.ap,
    damage: p.damage,
    keywordNames: p.keywords,
  };
}

const merge = (typed: WeaponKeywords, read: WeaponKeywords): WeaponKeywords => ({
  torrent: typed.torrent || read.torrent,
  lethalHits: typed.lethalHits || read.lethalHits,
  sustainedHits: typed.sustainedHits ?? read.sustainedHits,
  devastatingWounds: typed.devastatingWounds || read.devastatingWounds,
  twinLinked: typed.twinLinked || read.twinLinked,
  heavy: typed.heavy || read.heavy,
  lance: typed.lance || read.lance,
  ignoresCover: typed.ignoresCover || read.ignoresCover,
  precision: typed.precision || read.precision,
  indirectFire: typed.indirectFire || read.indirectFire,
  anti: [...typed.anti, ...read.anti],
  rapidFire: typed.rapidFire ?? read.rapidFire,
  blast: typed.blast ?? read.blast,
  cleave: typed.cleave ?? read.cleave,
  melta: typed.melta ?? read.melta,
});

/**
 * The form as an engine calculation, or what can't be read in it. `chosen` gives the profile
 * tried for each 'best' row (by row key; the first profile otherwise).
 */
export function toCalculation(
  form: MathhammerForm,
  chosen: Record<string, number> = {},
): { calculation: Calculation } | { error: string } {
  const targetKeywords = form.defender.keywords
    .split(',')
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k !== '');
  const problems: string[] = [];
  const dice = (label: string, text: string) => {
    if (parseDice(text) === null)
      problems.push(`${label}: can’t read “${text}” (use 3, D6, 2D6, D6+3…)`);
  };
  const weapons = form.weapons
    .filter((typed) => sitsOut(form, typed) === null)
    .map((typed) => {
      const row = statsOf(typed, chosen[typed.key] ?? 0);
      dice(`${row.name} attacks`, row.attacks);
      dice(`${row.name} damage`, row.damage);
      if (optional(row.sustainedHits) !== null)
        dice(`${row.name} Sustained Hits`, row.sustainedHits);
      if (optional(row.rapidFire) !== null) dice(`${row.name} Rapid Fire`, row.rapidFire);
      const anti = parseAnti(row.anti);
      if (anti === null)
        problems.push(`${row.name}: can’t read Anti “${row.anti}” (write e.g. INFANTRY 4+)`);
      return buildWeapon(
        {
          name: row.name,
          models: row.models,
          melee: row.melee,
          attacks: row.attacks,
          skill: row.skill,
          strength: row.strength,
          ap: row.ap,
          damage: row.damage,
        },
        merge(
          {
            torrent: row.torrent,
            lethalHits: row.lethalHits,
            sustainedHits: optional(row.sustainedHits),
            devastatingWounds: row.devastatingWounds,
            twinLinked: row.twinLinked,
            heavy: row.heavy,
            lance: row.lance,
            ignoresCover: row.ignoresCover,
            precision: row.precision,
            indirectFire: row.indirectFire,
            anti: anti ?? [],
            rapidFire: optional(row.rapidFire),
            blast: row.blast,
            cleave: row.cleave,
            melta: row.melta,
          },
          readKeywords(row.keywordNames, targetKeywords),
        ),
        row.own ?? form.unit,
      );
    });
  if (form.unit.sustainedHits !== null) dice('Sustained Hits', form.unit.sustainedHits);
  const flatMortals = optional(form.flatMortals);
  if (flatMortals !== null) dice('Mortal wounds', flatMortals);
  if (form.defender.groups.length === 0)
    problems.push('Add at least one kind of model to the target');
  if (problems.length > 0) return { error: problems.join(' · ') };
  const d = form.defender;
  return {
    calculation: {
      weapons,
      defender: {
        groups: d.groups.map(({ key: _key, ...group }) => group),
        keywords: targetKeywords,
        attached: d.attached,
        stealth: d.stealth,
        hitModifier: d.hitModifier,
        woundModifier: d.woundModifier,
        damageReduction: d.damageReduction,
        halveDamage: d.halveDamage,
        savePenaltiesIgnored: d.savePenaltiesIgnored,
      },
      situation: form.situation,
      flatMortals,
    },
  };
}
```

- [ ] **Step 8: Write `apps/web/src/features/mathhammer/datasheet-form.ts`**

```ts
import type { UnitDatasheet, UnitProfile } from '@bcp/shared';
import {
  newGroup,
  newWeapon,
  type DefenderForm,
  type GroupRow,
  type WeaponRow,
} from './form-state';

/** How many of each model kind a size has (the smallest size when out of range). */
function counts(sheet: UnitDatasheet, sizeIndex: number): Map<string, number> {
  const size = sheet.sizes[sizeIndex] ?? sheet.sizes[0];
  return new Map((size?.models ?? []).map((m) => [m.modelId, m.count]));
}

/** A weapon row from a datasheet profile; with several profiles, Best is chosen. */
function rowFrom(name: string, models: number, profiles: UnitProfile[]): WeaponRow {
  const first = profiles[0];
  return {
    ...newWeapon(),
    name,
    models,
    melee: first?.melee ?? false,
    attacks: first?.attacks ?? '1',
    skill: first?.skill ?? null,
    strength: first?.strength ?? 4,
    ap: first?.ap ?? 0,
    damage: first?.damage ?? '1',
    profiles,
    profile: profiles.length > 1 ? 'best' : 0,
    keywordNames: first?.keywords ?? [],
  };
}

/**
 * The attacker's weapons for a unit of this size, with its attached characters: one row per
 * weapon of the default loadout, counting every model that carries it.
 */
export function attackerRows(
  sheet: UnitDatasheet,
  sizeIndex: number,
  attached: UnitDatasheet[],
): WeaponRow[] {
  const rowsOf = (unit: UnitDatasheet, size: number, prefix: string) => {
    const howMany = counts(unit, size);
    const carried = new Map<string, number>();
    for (const entry of unit.loadout) {
      const models = howMany.get(entry.modelId) ?? 0;
      if (models > 0)
        carried.set(entry.weaponId, (carried.get(entry.weaponId) ?? 0) + models * entry.count);
    }
    return unit.weapons.flatMap((weapon) => {
      const models = carried.get(weapon.id) ?? 0;
      return models > 0 && weapon.profiles.length > 0
        ? [rowFrom(`${prefix}${weapon.name}`, models, weapon.profiles)]
        : [];
    });
  };
  return [
    ...rowsOf(sheet, sizeIndex, ''),
    ...attached.flatMap((character) => rowsOf(character, 0, `${character.name}: `)),
  ];
}

/** Model rows of a unit: kinds with the same profile are one row (one allocation group). */
function groupsOf(unit: UnitDatasheet, sizeIndex: number, character: boolean): GroupRow[] {
  const howMany = counts(unit, sizeIndex);
  const rows: GroupRow[] = [];
  for (const model of unit.models) {
    const models = howMany.get(model.id) ?? 0;
    if (models === 0) continue;
    const same = rows.find(
      (r) =>
        r.toughness === model.toughness &&
        r.save === model.save &&
        r.invuln === model.invuln &&
        r.wounds === model.wounds,
    );
    if (same !== undefined && !character) {
      same.models += models;
      if (!same.name.split(' / ').includes(model.name)) same.name = `${same.name} / ${model.name}`;
      continue;
    }
    rows.push({
      ...newGroup(),
      name: model.name,
      models,
      toughness: model.toughness,
      save: model.save,
      invuln: model.invuln,
      wounds: model.wounds,
      fnp: unit.fnp,
      character,
    });
  }
  return rows;
}

/** The defender filled from a unit of this size and its attached characters; switches kept. */
export function defenderFrom(
  sheet: UnitDatasheet,
  sizeIndex: number,
  attached: UnitDatasheet[],
  previous: DefenderForm,
): DefenderForm {
  const all = [sheet, ...attached];
  return {
    ...previous,
    source: [sheet.name, ...attached.map((a) => a.name)].join(' + '),
    groups: [
      ...groupsOf(sheet, sizeIndex, false),
      ...attached.flatMap((character) => groupsOf(character, 0, true)),
    ],
    keywords: [...new Set(all.flatMap((unit) => unit.keywords))].join(', '),
    attached: attached.length > 0,
    stealth: all.every((unit) => unit.stealth),
  };
}
```

- [ ] **Step 9: Write `apps/web/src/features/mathhammer/best.ts`**

```ts
import { calculate } from '@bcp/shared';
import { toCalculation, type MathhammerForm } from './form-state';
import type { Outcome } from './ResultPanel';

/** More than this many combinations: each Best weapon is chosen on its own instead. */
const MAX_COMBINATIONS = 16;

interface Tried {
  score: [number, number];
  outcome: Outcome;
}

function attempt(form: MathhammerForm, chosen: Record<string, number>): Tried | { error: string } {
  const read = toCalculation(form, chosen);
  if ('error' in read) return read;
  try {
    const result = calculate(read.calculation);
    return {
      score: [result.averages.modelsSlain, result.averages.woundsDealt],
      outcome: { result, groupNames: form.defender.groups.map((g) => g.name), best: {} },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const better = (a: [number, number], b: [number, number]) =>
  a[0] > b[0] + 1e-12 || (Math.abs(a[0] - b[0]) <= 1e-12 && a[1] > b[1] + 1e-12);

/**
 * The form's result, with each weapon set to Best using the profile that slays most models after
 * overkill against this target (then most wounds). `best` names the profiles chosen.
 */
export function calculateForm(form: MathhammerForm): Outcome {
  const open = form.weapons.filter((w) => w.profile === 'best' && w.profiles.length > 1);
  const names = (chosen: Record<string, number>) =>
    Object.fromEntries(open.map((w) => [w.key, w.profiles[chosen[w.key] ?? 0]?.name ?? '']));
  const combinations = open.reduce((n, w) => n * w.profiles.length, 1);
  let chosen: Record<string, number> = {};
  if (combinations <= MAX_COMBINATIONS) {
    let best: { tried: Tried; chosen: Record<string, number> } | null = null;
    const walk = (index: number, picks: Record<string, number>): { error: string } | null => {
      const row = open[index];
      if (row === undefined) {
        const tried = attempt(form, picks);
        if ('error' in tried) return tried;
        if (best === null || better(tried.score, best.tried.score)) best = { tried, chosen: picks };
        return null;
      }
      for (let i = 0; i < row.profiles.length; i += 1) {
        const failed = walk(index + 1, { ...picks, [row.key]: i });
        if (failed !== null) return failed;
      }
      return null;
    };
    const failed = walk(0, {});
    if (failed !== null) return failed;
    const found = best as { tried: Tried; chosen: Record<string, number> } | null;
    if (found === null) return { error: 'Nothing to calculate' };
    chosen = found.chosen;
  } else {
    // Too many combinations: settle each Best weapon in turn, the others as chosen so far.
    for (const row of open) {
      let top: { score: [number, number]; index: number } | null = null;
      for (let i = 0; i < row.profiles.length; i += 1) {
        const tried = attempt(form, { ...chosen, [row.key]: i });
        if ('error' in tried) return tried;
        if (top === null || better(tried.score, top.score)) top = { score: tried.score, index: i };
      }
      chosen = { ...chosen, [row.key]: top?.index ?? 0 };
    }
  }
  const final = attempt(form, chosen);
  if ('error' in final) return final;
  return { ...final.outcome, best: names(chosen) };
}
```

- [ ] **Step 10: Write `apps/web/src/features/mathhammer/mathhammer-queries.ts`**

```ts
import { MathhammerFactionsSchema, MathhammerUnitsSchema } from '@bcp/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../../api/client';

export const factionsQuery = queryOptions({
  queryKey: ['mathhammer', 'factions'],
  queryFn: () => apiGet('/api/mathhammer/factions', MathhammerFactionsSchema),
  staleTime: 60 * 60 * 1000,
});

export const unitsQuery = (faction: string) =>
  queryOptions({
    queryKey: ['mathhammer', 'units', faction],
    queryFn: () =>
      apiGet(`/api/mathhammer/units?faction=${encodeURIComponent(faction)}`, MathhammerUnitsSchema),
    staleTime: 60 * 60 * 1000,
  });
```

- [ ] **Step 11: Write `apps/web/src/features/mathhammer/inputs.tsx`**

```tsx
import { Checkbox, NumberInput, Select, TextInput } from '@mantine/core';
import type { Reroll } from '@bcp/shared';
import { useState } from 'react';

/**
 * A small whole-number field, kept within `min`/`max`; with `nullable`, empty means none.
 * Half-typed text ("-", or empty in a field that needs a number) stays in the field until it
 * becomes a number, so the calculation never sees it.
 */
export function Num({
  label,
  value,
  onChange,
  min,
  max,
  nullable = false,
  w = 72,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  nullable?: boolean;
  w?: number;
  disabled?: boolean;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <NumberInput
      size="xs"
      label={label}
      value={typing ?? value ?? ''}
      min={min}
      max={max}
      w={w}
      disabled={disabled}
      allowDecimal={false}
      onBlur={() => {
        setTyping(null);
      }}
      onChange={(next) => {
        const number = typeof next === 'number' ? next : Number.NaN;
        if (next === '' && nullable) {
          setTyping(null);
          onChange(null);
        } else if (Number.isFinite(number)) {
          setTyping(null);
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number)));
        } else setTyping(String(next));
      }}
    />
  );
}

/** A dice field: 3, D6, 2D6, D6+3… */
export function DiceInput({
  label,
  value,
  onChange,
  w = 72,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  w?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <TextInput
      size="xs"
      label={label}
      value={value}
      w={w}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
    />
  );
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      size="xs"
      label={label}
      checked={checked}
      onChange={(event) => {
        onChange(event.currentTarget.checked);
      }}
    />
  );
}

const REROLLS: { value: Reroll; label: string }[] = [
  { value: 'none', label: 'No re-roll' },
  { value: 'ones', label: 'Re-roll 1s' },
  { value: 'failures', label: 'Re-roll fails' },
  { value: 'fish', label: 'Re-roll non-criticals' },
];

export function RerollSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Reroll;
  onChange: (value: Reroll) => void;
}) {
  return (
    <Select
      size="xs"
      label={label}
      data={REROLLS}
      value={value}
      w={170}
      allowDeselect={false}
      onChange={(next) => {
        const found = REROLLS.find((r) => r.value === next);
        if (found !== undefined) onChange(found.value);
      }}
    />
  );
}

/** -1, 0 or +1. */
export function ModifierSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Select
      size="xs"
      label={label}
      data={['-1', '0', '+1']}
      value={value > 0 ? '+1' : String(value)}
      w={80}
      allowDeselect={false}
      onChange={(next) => {
        onChange(Number(next ?? '0'));
      }}
    />
  );
}

/** Critical on 2+ … 6+. */
export function CritSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Select
      size="xs"
      label={label}
      data={['6', '5', '4', '3', '2'].map((v) => ({ value: v, label: `${v}+` }))}
      value={String(value)}
      w={80}
      allowDeselect={false}
      onChange={(next) => {
        onChange(Number(next ?? '6'));
      }}
    />
  );
}
```

- [ ] **Step 12: Write `apps/web/src/features/mathhammer/SwitchesEditor.tsx`**

```tsx
import type { WeaponMods } from '@bcp/shared';
import { Group, Stack, Text } from '@mantine/core';
import { Check, CritSelect, DiceInput, ModifierSelect, Num, RerollSelect } from './inputs';

/** Hit, wound, save and damage switches: the unit's, or a weapon's own. */
export function SwitchesEditor({
  mods: unit,
  onChange,
}: {
  mods: WeaponMods;
  onChange: (mods: WeaponMods) => void;
}) {
  const set = (patch: Partial<WeaponMods>) => {
    onChange({ ...unit, ...patch });
  };
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        Hit roll
      </Text>
      <Group gap="xs" align="flex-end">
        <RerollSelect
          label="Re-roll hits"
          value={unit.hitReroll}
          onChange={(v) => {
            set({ hitReroll: v });
          }}
        />
        <Check
          label="Re-roll one hit"
          checked={unit.hitRerollOneDie}
          onChange={(v) => {
            set({ hitRerollOneDie: v });
          }}
        />
        <ModifierSelect
          label="To hit"
          value={unit.hitModifier}
          onChange={(v) => {
            set({ hitModifier: v });
          }}
        />
        <Check
          label="Ignore hit penalties"
          checked={unit.hitIgnorePenalties}
          onChange={(v) => {
            set({ hitIgnorePenalties: v });
          }}
        />
        <CritSelect
          label="Critical hit"
          value={unit.critHitOn}
          onChange={(v) => {
            set({ critHitOn: v });
          }}
        />
        <DiceInput
          label="Sustained Hits"
          value={unit.sustainedHits ?? ''}
          w={96}
          onChange={(v) => {
            set({ sustainedHits: v.trim() === '' ? null : v.trim() });
          }}
        />
        <Check
          label="Lethal Hits"
          checked={unit.lethalHits}
          onChange={(v) => {
            set({ lethalHits: v });
          }}
        />
        <Check
          label="Ignores Cover"
          checked={unit.ignoresCover}
          onChange={(v) => {
            set({ ignoresCover: v });
          }}
        />
      </Group>
      <Text size="sm" fw={600}>
        Wound roll
      </Text>
      <Group gap="xs" align="flex-end">
        <RerollSelect
          label="Re-roll wounds"
          value={unit.woundReroll}
          onChange={(v) => {
            set({ woundReroll: v });
          }}
        />
        <Check
          label="Re-roll one wound"
          checked={unit.woundRerollOneDie}
          onChange={(v) => {
            set({ woundRerollOneDie: v });
          }}
        />
        <ModifierSelect
          label="To wound"
          value={unit.woundModifier}
          onChange={(v) => {
            set({ woundModifier: v });
          }}
        />
        <Check
          label="Ignore wound penalties"
          checked={unit.woundIgnorePenalties}
          onChange={(v) => {
            set({ woundIgnorePenalties: v });
          }}
        />
        <CritSelect
          label="Critical wound"
          value={unit.critWoundOn}
          onChange={(v) => {
            set({ critWoundOn: v });
          }}
        />
        <Num
          label="Critical AP +"
          value={unit.critAp}
          min={0}
          w={96}
          onChange={(v) => {
            set({ critAp: v ?? 0 });
          }}
        />
        <Num
          label="Critical D +"
          value={unit.critDamage}
          min={0}
          w={96}
          onChange={(v) => {
            set({ critDamage: v ?? 0 });
          }}
        />
        <Check
          label="Devastating Wounds"
          checked={unit.devastatingWounds}
          onChange={(v) => {
            set({ devastatingWounds: v });
          }}
        />
      </Group>
      <Text size="sm" fw={600}>
        Saves and damage
      </Text>
      <Group gap="xs" align="flex-end">
        <Num
          label="Improve AP by"
          value={unit.apImprove}
          min={0}
          w={96}
          onChange={(v) => {
            set({ apImprove: v ?? 0 });
          }}
        />
        <Num
          label="Worsen saves by"
          value={unit.saveModifier}
          min={0}
          w={110}
          onChange={(v) => {
            set({ saveModifier: v ?? 0 });
          }}
        />
        <Check
          label="Re-roll damage"
          checked={unit.damageReroll}
          onChange={(v) => {
            set({ damageReroll: v });
          }}
        />
        <Check
          label="Re-roll one damage"
          checked={unit.damageRerollOneDie}
          onChange={(v) => {
            set({ damageRerollOneDie: v });
          }}
        />
        <Num
          label="Damage +"
          value={unit.damageModifier}
          min={-3}
          w={80}
          onChange={(v) => {
            set({ damageModifier: v ?? 0 });
          }}
        />
        <Check
          label="Ignore damage reduction"
          checked={unit.ignoreDamageReduction}
          onChange={(v) => {
            set({ ignoreDamageReduction: v });
          }}
        />
      </Group>
    </Stack>
  );
}
```

- [ ] **Step 13: Write `apps/web/src/features/mathhammer/UnitPicker.tsx`**

```tsx
import type { UnitDatasheet } from '@bcp/shared';
import { Alert, Button, Group, MultiSelect, Select, Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { factionsQuery, unitsQuery } from './mathhammer-queries';
import { Check } from './inputs';

const sizeLabel = (sheet: UnitDatasheet, index: number) => {
  const size = sheet.sizes[index];
  const models = size?.models.reduce((s, m) => s + m.count, 0) ?? 0;
  const points =
    size?.points === null || size?.points === undefined ? '' : ` (${String(size.points)} pts)`;
  return `${String(models)} model${models === 1 ? '' : 's'}${points}`;
};

/**
 * Picks a unit from 39k.pro's datasheets: faction, unit, size and attached characters (only
 * those that can lead or support it, unless "show all"). "Use" fills the side.
 */
export function UnitPicker({
  label,
  onPick,
}: {
  label: string;
  onPick: (sheet: UnitDatasheet, sizeIndex: number, attached: UnitDatasheet[]) => void;
}) {
  const [faction, setFaction] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [size, setSize] = useState('0');
  const [attachIds, setAttachIds] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const factions = useQuery(factionsQuery);
  const units = useQuery({ ...unitsQuery(faction ?? ''), enabled: faction !== null });

  if (factions.error) {
    return (
      <Alert color="yellow" title="No unit data yet">
        {factions.error.message}
      </Alert>
    );
  }
  const sheets = units.data?.datasheets ?? [];
  const sheet = sheets.find((s) => s.id === unitId);
  const characters = sheets.filter(
    (s) =>
      s.keywords.includes('CHARACTER') &&
      s.id !== unitId &&
      (showAll ||
        (sheet !== undefined && (s.leads.includes(sheet.id) || s.supports.includes(sheet.id)))),
  );
  return (
    <Stack gap="xs">
      <Group gap="xs" align="flex-end">
        <Select
          size="xs"
          label={`${label} faction`}
          searchable
          w={200}
          data={(factions.data?.factions ?? []).map((f) => f.faction)}
          value={faction}
          onChange={(next) => {
            setFaction(next);
            setUnitId(null);
            setAttachIds([]);
          }}
        />
        <Select
          size="xs"
          label={`${label} unit`}
          searchable
          w={240}
          disabled={faction === null}
          data={sheets.map((s) => ({
            value: s.id,
            label: s.legends ? `${s.name} (Legends)` : s.name,
          }))}
          value={unitId}
          onChange={(next) => {
            setUnitId(next);
            setSize('0');
            setAttachIds([]);
          }}
        />
        {sheet !== undefined && sheet.sizes.length > 1 && (
          <Select
            size="xs"
            label="Size"
            w={150}
            allowDeselect={false}
            data={sheet.sizes.map((_, i) => ({ value: String(i), label: sizeLabel(sheet, i) }))}
            value={size}
            onChange={(next) => {
              setSize(next ?? '0');
            }}
          />
        )}
      </Group>
      {sheet !== undefined && (
        <Group gap="xs" align="flex-end">
          <MultiSelect
            size="xs"
            label="Attached characters"
            w={300}
            data={characters.map((c) => ({ value: c.id, label: c.name }))}
            value={attachIds}
            onChange={setAttachIds}
          />
          <Check label="Show all characters" checked={showAll} onChange={setShowAll} />
          <Button
            size="xs"
            onClick={() => {
              onPick(
                sheet,
                Number(size),
                attachIds.flatMap((id) => sheets.filter((s) => s.id === id)),
              );
            }}
          >
            Use
          </Button>
        </Group>
      )}
    </Stack>
  );
}
```

- [ ] **Step 14: Write `apps/web/src/features/mathhammer/WeaponEditor.tsx`**

```tsx
import type { WeaponMods } from '@bcp/shared';
import { Button, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import type { WeaponRow } from './form-state';
import { Check, DiceInput, Num } from './inputs';
import { SwitchesEditor } from './SwitchesEditor';

/** One weapon: its profile on the first line, its keywords on the second. */
export function WeaponEditor({
  index,
  weapon,
  count,
  unit,
  bestName,
  sitsOut,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  weapon: WeaponRow;
  count: number;
  /** The unit's switches, the starting point for the weapon's own. */
  unit: WeaponMods;
  /** The profile Best chose, when the weapon is set to Best. */
  bestName: string | null;
  /** Why the weapon doesn't attack in this phase; null when it does. */
  sitsOut: string | null;
  onChange: (patch: Partial<WeaponRow>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const w = weapon;
  // With Best, the profile is chosen for the target: its values aren't typed.
  const picked = w.profile === 'best';
  return (
    <Paper
      withBorder
      p="sm"
      component="fieldset"
      aria-label={`Weapon ${String(index + 1)}`}
      opacity={sitsOut === null ? 1 : 0.6}
    >
      <Stack gap="xs">
        {sitsOut !== null && (
          <Text size="xs" c="dimmed">
            {sitsOut}
          </Text>
        )}
        <Group gap="xs" align="flex-end">
          <TextInput
            size="xs"
            label="Weapon"
            value={w.name}
            w={150}
            onChange={(event) => {
              onChange({ name: event.currentTarget.value });
            }}
          />
          <Num
            label="Models"
            value={w.models}
            min={0}
            onChange={(v) => {
              onChange({ models: v ?? 0 });
            }}
          />
          <DiceInput
            label="Attacks"
            disabled={picked}
            value={w.attacks}
            onChange={(v) => {
              onChange({ attacks: v });
            }}
          />
          <Num
            label={w.melee ? 'WS' : 'BS'}
            disabled={picked}
            value={w.skill}
            min={2}
            max={6}
            nullable
            onChange={(v) => {
              onChange({ skill: v });
            }}
          />
          <Num
            label="S"
            disabled={picked}
            value={w.strength}
            min={1}
            onChange={(v) => {
              onChange({ strength: v ?? 1 });
            }}
          />
          <Num
            label="AP"
            disabled={picked}
            value={w.ap}
            min={-6}
            max={0}
            onChange={(v) => {
              onChange({ ap: v ?? 0 });
            }}
          />
          <DiceInput
            label="D"
            disabled={picked}
            value={w.damage}
            onChange={(v) => {
              onChange({ damage: v });
            }}
          />
          <Check
            label="Melee"
            checked={w.melee}
            onChange={(v) => {
              onChange({ melee: v });
            }}
          />
          <Group gap={4}>
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => {
                onMove(-1);
              }}
            >
              ↑
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Move down"
              disabled={index === count - 1}
              onClick={() => {
                onMove(1);
              }}
            >
              ↓
            </Button>
            <Button size="compact-xs" variant="subtle" color="red" onClick={onRemove}>
              Remove
            </Button>
          </Group>
        </Group>
        {w.profiles.length > 1 && (
          <Group gap="xs" align="flex-end">
            <Select
              size="xs"
              label="Profile"
              w={200}
              allowDeselect={false}
              data={[
                { value: 'best', label: 'Best' },
                ...w.profiles.map((p, i) => ({ value: String(i), label: p.name })),
              ]}
              value={String(w.profile)}
              onChange={(next) => {
                if (next === 'best' || next === null) {
                  onChange({ profile: 'best' });
                  return;
                }
                const i = Number(next);
                const p = w.profiles[i];
                if (p === undefined) return;
                onChange({
                  profile: i,
                  melee: p.melee,
                  attacks: p.attacks,
                  skill: p.skill,
                  strength: p.strength ?? w.strength,
                  ap: p.ap,
                  damage: p.damage,
                  keywordNames: p.keywords,
                });
              }}
            />
            {picked && bestName !== null && (
              <Text size="xs" c="dimmed">{`Best here: ${bestName}`}</Text>
            )}
          </Group>
        )}
        {w.profiles.length > 0 && w.keywordNames.length > 0 && !picked && (
          <Text size="xs" c="dimmed">{`From datasheet: ${w.keywordNames.join(', ')}`}</Text>
        )}
        <Group gap="sm" align="flex-end">
          <Check
            label="Torrent"
            checked={w.torrent}
            onChange={(v) => {
              onChange({ torrent: v });
            }}
          />
          <Check
            label="Lethal Hits"
            checked={w.lethalHits}
            onChange={(v) => {
              onChange({ lethalHits: v });
            }}
          />
          <Check
            label="Devastating Wounds"
            checked={w.devastatingWounds}
            onChange={(v) => {
              onChange({ devastatingWounds: v });
            }}
          />
          <Check
            label="Twin-linked"
            checked={w.twinLinked}
            onChange={(v) => {
              onChange({ twinLinked: v });
            }}
          />
          <Check
            label="Heavy"
            checked={w.heavy}
            onChange={(v) => {
              onChange({ heavy: v });
            }}
          />
          <Check
            label="Lance"
            checked={w.lance}
            onChange={(v) => {
              onChange({ lance: v });
            }}
          />
          <Check
            label="Ignores Cover"
            checked={w.ignoresCover}
            onChange={(v) => {
              onChange({ ignoresCover: v });
            }}
          />
          <Check
            label="Precision"
            checked={w.precision}
            onChange={(v) => {
              onChange({ precision: v });
            }}
          />
          <Check
            label="Indirect Fire"
            checked={w.indirectFire}
            onChange={(v) => {
              onChange({ indirectFire: v });
            }}
          />
        </Group>
        <Group gap="xs" align="flex-end">
          <DiceInput
            label="Sustained Hits"
            value={w.sustainedHits}
            w={96}
            onChange={(v) => {
              onChange({ sustainedHits: v });
            }}
          />
          <DiceInput
            label="Rapid Fire"
            value={w.rapidFire}
            w={80}
            onChange={(v) => {
              onChange({ rapidFire: v });
            }}
          />
          <Num
            label="Blast"
            value={w.blast}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ blast: v });
            }}
          />
          <Num
            label="Cleave"
            value={w.cleave}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ cleave: v });
            }}
          />
          <Num
            label="Melta"
            value={w.melta}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ melta: v });
            }}
          />
          <TextInput
            size="xs"
            label="Anti"
            placeholder="INFANTRY 4+"
            value={w.anti}
            w={160}
            onChange={(event) => {
              onChange({ anti: event.currentTarget.value });
            }}
          />
        </Group>
        <Check
          label="Own switches"
          checked={w.own !== null}
          onChange={(on) => {
            onChange({ own: on ? { ...unit } : null });
          }}
        />
        {w.own !== null && (
          <SwitchesEditor
            mods={w.own}
            onChange={(own) => {
              onChange({ own });
            }}
          />
        )}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 15: Write `apps/web/src/features/mathhammer/AttackerPanel.tsx`**

```tsx
import { Button, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { Panel } from '../../components/Panel';
import { attackerRows } from './datasheet-form';
import { newWeapon, sitsOut, type MathhammerForm, type WeaponRow } from './form-state';
import { DiceInput } from './inputs';
import { SwitchesEditor } from './SwitchesEditor';
import { UnitPicker } from './UnitPicker';
import { WeaponEditor } from './WeaponEditor';

/** The attacking unit: picked or typed weapons in the order they resolve, and its switches. */
export function AttackerPanel({
  form,
  best,
  onChange,
}: {
  form: MathhammerForm;
  /** Profile names Best chose, by weapon row key. */
  best: Record<string, string>;
  onChange: (next: MathhammerForm) => void;
}) {
  const setWeapons = (weapons: WeaponRow[]) => {
    onChange({ ...form, weapons });
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...form.weapons];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(index + by, 0, moved);
    setWeapons(next);
  };
  return (
    <Panel title="Attacker">
      <Stack gap="md">
        <UnitPicker
          label="Attacker"
          onPick={(sheet, size, attached) => {
            onChange({
              ...form,
              source: [sheet.name, ...attached.map((a) => a.name)].join(' + '),
              weapons: attackerRows(sheet, size, attached),
            });
          }}
        />
        <SegmentedControl
          size="xs"
          aria-label="Phase"
          data={[
            { value: 'shooting', label: 'Shooting' },
            { value: 'fighting', label: 'Fighting' },
          ]}
          value={form.phase}
          onChange={(phase) => {
            onChange({ ...form, phase: phase === 'fighting' ? 'fighting' : 'shooting' });
          }}
        />
        {form.source !== null && (
          <Text size="xs" c="dimmed">{`From datasheet: ${form.source}`}</Text>
        )}
        {form.weapons.map((weapon, index) => (
          <WeaponEditor
            key={weapon.key}
            index={index}
            weapon={weapon}
            count={form.weapons.length}
            unit={form.unit}
            bestName={best[weapon.key] ?? null}
            sitsOut={sitsOut(form, weapon)}
            onChange={(patch) => {
              setWeapons(form.weapons.map((w) => (w.key === weapon.key ? { ...w, ...patch } : w)));
            }}
            onMove={(by) => {
              move(index, by);
            }}
            onRemove={() => {
              setWeapons(form.weapons.filter((w) => w.key !== weapon.key));
            }}
          />
        ))}
        <Group>
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              setWeapons([...form.weapons, newWeapon()]);
            }}
          >
            Add weapon
          </Button>
        </Group>
        <SwitchesEditor
          mods={form.unit}
          onChange={(unit) => {
            onChange({ ...form, unit });
          }}
        />
        <DiceInput
          label="Mortal wounds"
          value={form.flatMortals}
          w={96}
          placeholder="D3"
          onChange={(flatMortals) => {
            onChange({ ...form, flatMortals });
          }}
        />
      </Stack>
    </Panel>
  );
}
```

- [ ] **Step 16: Write `apps/web/src/features/mathhammer/DefenderPanel.tsx`**

```tsx
import { Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { Panel } from '../../components/Panel';
import { defenderFrom } from './datasheet-form';
import { newGroup, type DefenderForm, type GroupRow } from './form-state';
import { Check, Num } from './inputs';
import { UnitPicker } from './UnitPicker';

function GroupEditor({
  index,
  group,
  onChange,
  onRemove,
}: {
  index: number;
  group: GroupRow;
  onChange: (patch: Partial<GroupRow>) => void;
  onRemove: () => void;
}) {
  const g = group;
  return (
    <Paper withBorder p="sm" component="fieldset" aria-label={`Models ${String(index + 1)}`}>
      <Group gap="xs" align="flex-end">
        <TextInput
          size="xs"
          label="Models"
          value={g.name}
          w={130}
          onChange={(event) => {
            onChange({ name: event.currentTarget.value });
          }}
        />
        <Num
          label="How many"
          value={g.models}
          min={1}
          onChange={(v) => {
            onChange({ models: v ?? 1 });
          }}
        />
        <Num
          label="T"
          value={g.toughness}
          min={1}
          w={60}
          onChange={(v) => {
            onChange({ toughness: v ?? 1 });
          }}
        />
        <Num
          label="Sv"
          value={g.save}
          min={2}
          max={7}
          w={60}
          onChange={(v) => {
            onChange({ save: v ?? 7 });
          }}
        />
        <Num
          label="InSv"
          value={g.invuln}
          min={2}
          max={6}
          w={60}
          nullable
          onChange={(v) => {
            onChange({ invuln: v });
          }}
        />
        <Num
          label="W"
          value={g.wounds}
          min={1}
          w={60}
          onChange={(v) => {
            onChange({ wounds: v ?? 1 });
          }}
        />
        <Num
          label="FNP"
          value={g.fnp}
          min={2}
          max={6}
          w={60}
          nullable
          onChange={(v) => {
            onChange({ fnp: v });
          }}
        />
        <Check
          label="Character"
          checked={g.character}
          onChange={(v) => {
            onChange({ character: v });
          }}
        />
        <Button size="compact-xs" variant="subtle" color="red" onClick={onRemove}>
          Remove
        </Button>
      </Group>
    </Paper>
  );
}

/** The target: its kinds of model (a leader is a Character), keywords and switches. */
export function DefenderPanel({
  defender,
  onChange,
}: {
  defender: DefenderForm;
  onChange: (next: DefenderForm) => void;
}) {
  const set = (patch: Partial<DefenderForm>) => {
    onChange({ ...defender, ...patch });
  };
  return (
    <Panel title="Defender">
      <Stack gap="md">
        <UnitPicker
          label="Defender"
          onPick={(sheet, size, attached) => {
            onChange(defenderFrom(sheet, size, attached, defender));
          }}
        />
        {defender.source !== null && (
          <Text size="xs" c="dimmed">{`From datasheet: ${defender.source}`}</Text>
        )}
        <Text size="xs" c="dimmed">
          One row per kind of model; a leader is its own row with Character ticked. Sv 7 means no
          save.
        </Text>
        {defender.groups.map((group, index) => (
          <GroupEditor
            key={group.key}
            index={index}
            group={group}
            onChange={(patch) => {
              set({
                groups: defender.groups.map((g) => (g.key === group.key ? { ...g, ...patch } : g)),
              });
            }}
            onRemove={() => {
              set({ groups: defender.groups.filter((g) => g.key !== group.key) });
            }}
          />
        ))}
        <Group>
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              set({ groups: [...defender.groups, newGroup()] });
            }}
          >
            Add models
          </Button>
        </Group>
        <TextInput
          size="xs"
          label="Keywords"
          description="For Anti-X, e.g. INFANTRY, ORKS"
          value={defender.keywords}
          onChange={(event) => {
            set({ keywords: event.currentTarget.value });
          }}
        />
        <Group gap="sm" align="flex-end">
          <Check
            label="Attached unit"
            checked={defender.attached}
            onChange={(v) => {
              set({ attached: v });
            }}
          />
          <Check
            label="Stealth"
            checked={defender.stealth}
            onChange={(v) => {
              set({ stealth: v });
            }}
          />
          <Check
            label="-1 to be hit"
            checked={defender.hitModifier < 0}
            onChange={(v) => {
              set({ hitModifier: v ? -1 : 0 });
            }}
          />
          <Check
            label="-1 to be wounded"
            checked={defender.woundModifier < 0}
            onChange={(v) => {
              set({ woundModifier: v ? -1 : 0 });
            }}
          />
          <Check
            label="Halve damage"
            checked={defender.halveDamage}
            onChange={(v) => {
              set({ halveDamage: v });
            }}
          />
          <Check
            label="Save penalties ignored"
            checked={defender.savePenaltiesIgnored}
            onChange={(v) => {
              set({ savePenaltiesIgnored: v });
            }}
          />
          <Num
            label="Damage -"
            value={defender.damageReduction}
            min={0}
            w={80}
            onChange={(v) => {
              set({ damageReduction: v ?? 0 });
            }}
          />
        </Group>
      </Stack>
    </Panel>
  );
}
```

- [ ] **Step 17: Write `apps/web/src/features/mathhammer/ResultPanel.tsx`**

```tsx
import { atLeast, type CalculationResult } from '@bcp/shared';
import { Alert, Group, Stack, Table, Text } from '@mantine/core';
import { Panel } from '../../components/Panel';
import classes from './ResultPanel.module.css';

/** 0.623 → "62%"; tiny chances never round to a flat 0% or 100%. */
export function percent(p: number): string {
  if (p > 0 && p < 0.005) return '<1%';
  if (p < 1 && p >= 0.995) return '>99%';
  return `${String(Math.round(p * 100))}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={600} className="numeric" aria-label={label}>
        {value}
      </Text>
    </Stack>
  );
}

export type Outcome =
  | {
      result: CalculationResult;
      groupNames: string[];
      /** Profile names Best chose, by weapon row key. */
      best: Record<string, string>;
    }
  | { error: string };

/** Averages, the chance of each number of models slain or more, and the allocation used. */
export function ResultPanel({ outcome }: { outcome: Outcome }) {
  if ('error' in outcome) {
    return (
      <Panel title="Result">
        <Alert color="red" title="Can’t calculate">
          {outcome.error}
        </Alert>
      </Panel>
    );
  }
  const { result, groupNames } = outcome;
  const slain = atLeast(result.modelsSlain).slice(1);
  const order = result.orders[0];
  return (
    <Panel title="Result">
      <Stack gap="md">
        <Group gap="xl">
          <Stat label="Models slain" value={result.averages.modelsSlain.toFixed(2)} />
          <Stat label="Wounds dealt" value={result.averages.woundsDealt.toFixed(2)} />
          <Stat label="Wasted damage" value={result.averages.wasted.toFixed(2)} />
          <Stat label="Wipe" value={percent(result.wipe)} />
          {result.leaderSlain !== null && (
            <Stat label="Leader slain" value={percent(result.leaderSlain)} />
          )}
        </Group>
        <Table aria-label="Models slain, at least" withRowBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Models slain</Table.Th>
              <Table.Th ta="right">Chance</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {slain.map((p, i) => (
              <Table.Tr key={i}>
                <Table.Td className="numeric">{`${String(i + 1)}+`}</Table.Td>
                <Table.Td ta="right" className="numeric">
                  {percent(p)}
                </Table.Td>
                <Table.Td w="60%">
                  <div className={classes.track} aria-hidden>
                    <div className={classes.bar} style={{ width: `${String(p * 100)}%` }} />
                  </div>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {order !== undefined && groupNames.length > 1 && (
          <Text size="xs" c="dimmed">
            {`Allocation: ${order.map((g) => groupNames[g] ?? '?').join(' → ')}`}
          </Text>
        )}
      </Stack>
    </Panel>
  );
}
```

- [ ] **Step 18: Write `apps/web/src/features/mathhammer/MathhammerPage.tsx`**

```tsx
import { Grid, Stack, Text, Title } from '@mantine/core';
import { useDeferredValue, useMemo, useState } from 'react';
import { AttackerPanel } from './AttackerPanel';
import { DefenderPanel } from './DefenderPanel';
import { calculateForm } from './best';
import { defaultForm } from './form-state';
import { ResultPanel, type Outcome } from './ResultPanel';
import { SituationPanel } from './SituationPanel';

/** Exact chances for one unit's attacks into one target (11th edition). */
export function MathhammerPage() {
  const [form, setForm] = useState(defaultForm);
  // Typing stays quick while a big calculation catches up.
  const settled = useDeferredValue(form);
  const outcome = useMemo<Outcome>(() => calculateForm(settled), [settled]);

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={1}>Mathhammer</Title>
        <Text size="sm" c="dimmed">
          Exact chances, worked out from the dice by 11th-edition rules.
        </Text>
      </Stack>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack gap="lg">
            <AttackerPanel
              form={form}
              best={'best' in outcome ? outcome.best : {}}
              onChange={setForm}
            />
            <SituationPanel
              situation={form.situation}
              onChange={(situation) => {
                setForm({ ...form, situation });
              }}
            />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="lg">
            <ResultPanel outcome={outcome} />
            <DefenderPanel
              defender={form.defender}
              onChange={(defender) => {
                setForm({ ...form, defender });
              }}
            />
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
```

- [ ] **Step 19: Run the tests and checks**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer/`
Expected: PASS (the files above hold 21 tests).
Then: `pnpm typecheck && pnpm exec eslint <the files above>` → no errors.

- [ ] **Step 20: Commit**

```bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
git add apps/web/src/features/mathhammer/AttackerPanel.tsx apps/web/src/features/mathhammer/DefenderPanel.tsx apps/web/src/features/mathhammer/MathhammerPage.test.tsx apps/web/src/features/mathhammer/MathhammerPage.tsx apps/web/src/features/mathhammer/ResultPanel.tsx apps/web/src/features/mathhammer/SwitchesEditor.tsx apps/web/src/features/mathhammer/UnitPicker.tsx apps/web/src/features/mathhammer/WeaponEditor.tsx apps/web/src/features/mathhammer/best.test.ts apps/web/src/features/mathhammer/best.ts apps/web/src/features/mathhammer/datasheet-form.test.ts apps/web/src/features/mathhammer/datasheet-form.ts apps/web/src/features/mathhammer/form-state.test.ts apps/web/src/features/mathhammer/form-state.ts apps/web/src/features/mathhammer/inputs.tsx apps/web/src/features/mathhammer/mathhammer-queries.ts apps/web/src/features/mathhammer/unit-fixtures.ts
git commit -m "feat: pick Mathhammer units from 39k.pro with Best profiles and a shooting/fighting phase

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Full check and a real run

- [ ] **Step 1:** `pnpm check` → green (about 1,188 tests). Fix formatting findings only, commit as `chore: format`.
- [ ] **Step 2:** Start the preview (`api`, `web`); the API reads 39k.pro on start. Check `/api/rules` shows ~34 factions, ~1,056 datasheets, ~4,576 weapons, no error. On `/mathhammer`: attacker Space Marines → Hellblaster Squad + Captain → Use: plasma rows set to Best with "Best here: …", pistols marked as sitting out; defender Orks → Boyz + Warboss → Use: Boy, Nob and Warboss (Character) rows; Fighting switches to melee weapons. Screenshot for the owner.
