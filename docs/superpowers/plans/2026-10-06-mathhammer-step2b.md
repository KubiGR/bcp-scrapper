# Mathhammer, Step 2b (Units from Lists) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill either side of the Mathhammer page from an army list (pasted, or a stored BCP list found by player or event): the list's units are offered as written, with their model counts, weapons and attached characters.

**Architecture:** Shared code reads a list's text into units (GW app and NewRecruit formats, with attachments) and matches them to 39k.pro datasheets (army family first, allies next; weapons by name, non-weapon wargear ignored, the rest "couldn't read"). The API serves a pasted list read and matched, and stored BCP lists searched by player or event. The page gets a "From a list" source per side; picking a list unit converts its groups of models and weapons into the same weapon rows / model rows the "Any unit" picker makes.

**Tech Stack:** TypeScript, Zod 4, Hono, Drizzle (Postgres/PGlite), React 19, Mantine 9, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-mathhammer-step2-design.md` (§2 "From a list", §5 Lists, §6 list routes, §7 delivery 2b), building on `2026-10-05-mathhammer-design.md`.

## Global Constraints

- Branch `mathhammer`; never merge to main (merging means releasing to production for the owner).
- 39k.pro's script is never executed; only `https://39k.pro/` is fetched. This plan adds no fetching.
- No network in tests; no BCP requests anywhere in this plan (stored lists only).
- All new routes are behind login like the other `/api/mathhammer/*` routes.
- Before `pnpm` or `git commit`: `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`.
- Copy: "Couldn't read: <names>" for unmatched wargear/units; units listed as written ("Custodian Wardens ×5").

## Decisions in this plan (rulings against the spec's detail)

- **Formats read:** the GW app export (492 of 544 lists in a real 544-player event; 442 use "Attached Units") and NewRecruit (`+ FACTION KEYWORD`, 34 of 544). Other formats (abbreviated ListForge shorthand, empty) give no units and the page says so; typing by hand still works.
- **Non-weapon wargear** (Vexilla, Relic Shield) is not "couldn't read": the extractor now keeps each datasheet's non-weapon wargear names (`wargear`), and `RULES_FORMAT` goes to 3 so stored data is re-read once.
- **Model groups:** a list unit is read as groups of models, each with its wargear and counts (GW: a model line and its weapons; NewRecruit: "5 with A, B"). Weapon rows count the weapons; a group's several melee weapons become one Best row (as 2a does for default loadouts).
- **Unnamed groups** (NewRecruit one-line units, single-model characters) go to the datasheet's model kind; when the unit has several kinds, the counts come from the datasheet size with the same total, else the most numerous kind takes them all.
- **A wargear name that is a model name** (NewRecruit "Plasmacyte, 3 with …") becomes a model group of that kind (count from the line, 1 if none).
- **Attached characters** are not offered on their own: they come with their bodyguard unit ("Custodian Wardens ×5 + Valerian"). Characters not attached are offered alone.
- **Stored list search:** player name or event name contains the search (case ignored), newest event first, 20 at most; at least 2 characters.

## Review Focus

1. **A list in a format we can't read** (ListForge shorthand, an empty list, free text): no units; the picker says "No units found in this list" and typing still works. Pinned in Task 2 (reader) and Task 7 (page).
2. **Allies and Legends:** an Imperial Agents unit in a Space Marines list, a Legends datasheet with the same name as a current one: allies matched after the army family; non-Legends first. Pinned in Task 3.
3. **The same weapon on several model kinds** (Sergeant and troopers with bolt rifles): one weapon row with the total. Pinned in Task 5.
4. **NewRecruit attachments by index** ("Attached to Skorpekh Lord[2]"): the right character attaches to the right unit. Pinned in Task 2.
5. **A unit name with a typo or curly apostrophe** ("Khârn the Betrayer", "Lord’s blade"): matched loosely within the army family only. Pinned in Task 3.

---

## File Structure

- Modify `apps/api/src/rules/extract.ts`, `extract.test.ts` — datasheet `wargear` names; `RULES_FORMAT = 3`.
- Modify `packages/shared/src/mathhammer/data.ts` — `wargear` on datasheets; list schemas.
- Create `packages/shared/src/mathhammer/list-reader.ts` (+ test) — text → `ListRead`.
- Create `packages/shared/src/mathhammer/list-match.ts` (+ test) — `ListRead` + `UnitData` → `MathhammerList`.
- Modify `packages/shared/src/mathhammer/index.ts` — exports.
- Create `apps/api/src/repo/mathhammer-lists.ts` (+ test) — stored list search.
- Modify `apps/api/src/routes/mathhammer.ts` (+ test) — list routes.
- Modify `apps/web/src/features/mathhammer/datasheet-form.ts` (+ test) — rows from list units.
- Modify `apps/web/src/features/mathhammer/mathhammer-queries.ts` — list queries.
- Create `apps/web/src/features/mathhammer/ListPicker.tsx`; modify `AttackerPanel.tsx`, `DefenderPanel.tsx`, `MathhammerPage.test.tsx`.
- Modify `apps/web/src/features/mathhammer/unit-fixtures.ts` — fixtures gain `wargear: []`.

---

### Task 1: Datasheets keep their non-weapon wargear names

**Files:**

- Modify: `packages/shared/src/mathhammer/data.ts` (UnitDatasheetSchema)
- Modify: `apps/api/src/rules/extract.ts` (`RULES_FORMAT`, datasheet return)
- Test: `apps/api/src/rules/extract.test.ts`
- Modify: `apps/web/src/features/mathhammer/unit-fixtures.ts`, any test datasheet literal the typecheck names

**Interfaces:**

- Produces: `UnitDatasheet.wargear: string[]` (non-weapon wargear names a datasheet can take, as written).

- [ ] **Step 1: Write the failing test** (in `extract.test.ts`, `describe('extractUnits')`)

```ts
it('keeps the names of wargear that isn’t a weapon', () => {
  expect(sheet('Captain')?.wargear).toEqual(['Relic Shield']);
  expect(sheet('Intercessor Squad')?.wargear).toEqual([]);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run --project api apps/api/src/rules/extract.test.ts`
Expected: FAIL (`wargear` undefined).

- [ ] **Step 3: Implement**

`data.ts`, in `UnitDatasheetSchema` after `weapons`:

```ts
  /** Wargear that isn't a weapon (Relic Shield, Vexilla): known, never "couldn't read". */
  wargear: z.array(z.string()),
```

`extract.ts`: `export const RULES_FORMAT = 3;`, and after `const weapons = …`:

```ts
const wargear = weaponIds.flatMap((itemId) => {
  const item = items.get(itemId);
  return item !== undefined && field(item, 'wargearType') !== 'weapon'
    ? [enText(item, 'name')]
    : [];
});
```

and `wargear,` after `weapons,` in the returned datasheet. Add `wargear: []` to each datasheet in `apps/web/src/features/mathhammer/unit-fixtures.ts` and to any other `UnitDatasheet` literal `pnpm typecheck` reports.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm vitest run --project api apps/api/src/rules && pnpm typecheck`
Expected: PASS; any test pinning `RULES_FORMAT`'s value is updated to 3.

- [ ] **Step 5: Commit**

```bash
git add -A apps packages && git commit -m "feat: datasheets keep their non-weapon wargear names"
```

---

### Task 2: The list reader (GW app and NewRecruit)

**Files:**

- Modify: `packages/shared/src/mathhammer/data.ts` (list read schemas)
- Create: `packages/shared/src/mathhammer/list-reader.ts`
- Test: `packages/shared/src/mathhammer/list-reader.test.ts`
- Modify: `packages/shared/src/mathhammer/index.ts`

**Interfaces:**

- Consumes: `parseArmyList(text).army` from `../army-list-parser`.
- Produces:

```ts
export interface ListWargear {
  name: string;
  count: number;
}
/** Models of one kind as the list writes them; `name` null when the list doesn't name them. */
export interface ListModels {
  name: string | null;
  count: number;
  wargear: ListWargear[];
}
export interface ListUnit {
  name: string;
  points: number | null;
  groups: ListModels[];
  /** Index (in `units`) of the unit this character is attached to (Leader or Support). */
  attachedTo: number | null;
}
export interface ListRead {
  army: string | null;
  units: ListUnit[];
}
export function readListUnits(text: string): ListRead;
```

- [ ] **Step 1: Write the failing tests** (`list-reader.test.ts`)

```ts
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

describe('readListUnits: other text', () => {
  it('finds no units in formats it can’t read', () => {
    expect(
      readListUnits('* [L1][W] Commander Farsight [70]\n* 10 Breacher Team [90]').units,
    ).toEqual([]);
    expect(readListUnits('').units).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/list-reader.test.ts`
Expected: FAIL (`readListUnits` not found).

- [ ] **Step 3: Implement** (`list-reader.ts`)

```ts
import { parseArmyList } from '../army-list-parser';

export interface ListWargear {
  name: string;
  count: number;
}
/** Models of one kind as the list writes them; `name` null when the list doesn't name them. */
export interface ListModels {
  name: string | null;
  count: number;
  wargear: ListWargear[];
}
export interface ListUnit {
  name: string;
  points: number | null;
  groups: ListModels[];
  /** Index (in `units`) of the unit this character is attached to (Leader or Support). */
  attachedTo: number | null;
}
export interface ListRead {
  army: string | null;
  units: ListUnit[];
}

/** Adds `count` of `name`, summing a name already there. */
function addWargear(list: ListWargear[], name: string, count: number) {
  const clean = name.trim();
  if (clean === '' || /^warlord$/i.test(clean)) return;
  const found = list.find((w) => w.name === clean);
  if (found) found.count += count;
  else list.push({ name: clean, count });
}

const indent = (line: string) => line.length - line.trimStart().length;
/** `• 5x Name`, `5x Name`. */
const ITEM = /^(?:•\s*)?(\d+)x\s+(.+)$/;

/** GW app: `Name (N points)` units, bullet model lines, "Attached Unit" blocks. */
function gwApp(lines: string[]): ListUnit[] {
  const sizeAt = lines.findIndex((line) =>
    /^(?:Combat Patrol|Incursion|Strike Force|Onslaught)\s*\(/i.test(line.trim()),
  );
  const units: ListUnit[] = [];
  // Per attachment block: [unit index, role].
  let block: { index: number; role: string }[] | null = null;
  const closeBlock = () => {
    if (block === null) return;
    const guard = block.find((b) => b.role === 'bodyguard');
    if (guard) {
      for (const b of block) {
        const unit = units[b.index];
        if (b.role !== 'bodyguard' && unit) unit.attachedTo = guard.index;
      }
    }
    block = null;
  };
  let unit: ListUnit | null = null;
  let group: ListModels | null = null;
  for (let i = sizeAt + 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (line === '') continue;
    if (/^Exported with/i.test(line)) break;
    if (/^Attached Unit \d+$/i.test(line)) {
      closeBlock();
      block = [];
      continue;
    }
    if (indent(raw) === 0 && /^[A-Z][A-Z &]+$/.test(line)) {
      // A section heading ("CHARACTERS") ends an attachment block.
      if (!/^ATTACHED UNITS$/.test(line)) closeBlock();
      unit = null;
      continue;
    }
    const header = indent(raw) === 0 ? /^(.+?)\s*\((\d+)\s*(?:points|pts)\)$/i.exec(line) : null;
    if (header) {
      unit = { name: header[1] ?? '', points: Number(header[2]), groups: [], attachedTo: null };
      units.push(unit);
      group = null;
      continue;
    }
    if (unit === null) continue;
    const role = /^•\s*Attached as:\s*(Leader|Support|Bodyguard)/i.exec(line);
    if (role) {
      block?.push({ index: units.length - 1, role: (role[1] ?? '').toLowerCase() });
      continue;
    }
    if (/^•\s*(?:Enhancement:|Warlord$)/i.test(line)) continue;
    const item = ITEM.exec(line);
    if (item === null) continue;
    const count = Number(item[1]);
    const name = item[2] ?? '';
    const next = lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
    if (
      indent(raw) <= 2 &&
      line.startsWith('•') &&
      indent(next) > indent(raw) &&
      next.trim().startsWith('•')
    ) {
      // A model line: its weapons follow, deeper.
      group = { name, count, wargear: [] };
      unit.groups.push(group);
      continue;
    }
    if (indent(raw) <= 2 && line.startsWith('•')) {
      // A single model's wargear: one unnamed group.
      group = unit.groups.find((g) => g.name === null) ?? null;
      if (group === null) {
        group = { name: null, count: 1, wargear: [] };
        unit.groups.push(group);
      }
    }
    if (group) addWargear(group.wargear, name, count);
  }
  closeBlock();
  return units;
}

/** `A, B, 3 with C, D` → items before any "N with" (count 1), then groups of N. */
function nrItems(text: string, total: number): ListWargear[] {
  const wargear: ListWargear[] = [];
  let count = 1;
  let grouped = false;
  for (const part of text.split(/,\s*/)) {
    const withN = /^(\d+)\s+with\s+(.+)$/i.exec(part.trim());
    if (withN) {
      count = Number(withN[1]);
      grouped = true;
      addWargear(wargear, withN[2] ?? '', count);
    } else {
      addWargear(wargear, part, grouped ? count : total === 1 ? 1 : 1);
    }
  }
  return wargear;
}

const NR_UNIT = /^(?:Char\d+:\s*)?(\d+)x\s+(.+?)\s*\((\d+)\s*pts\)(?::\s*(.*))?$/i;

/** NewRecruit: `Nx Name (P pts): wargear`, optional bullet model lines, "Attached to X[n]". */
function newRecruit(lines: string[]): ListUnit[] {
  const units: ListUnit[] = [];
  const attachTo: { unit: number; target: string; nth: number }[] = [];
  let unit: ListUnit | null = null;
  let group: ListModels | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('+')) continue;
    const head = indent(raw) === 0 ? NR_UNIT.exec(line) : null;
    if (head) {
      const total = Number(head[1]);
      unit = { name: head[2] ?? '', points: Number(head[3]), groups: [], attachedTo: null };
      units.push(unit);
      group = null;
      if (head[4] !== undefined && head[4].trim() !== '') {
        unit.groups.push({ name: null, count: total, wargear: nrItems(head[4], total) });
      }
      continue;
    }
    if (unit === null) continue;
    const attached = /^Attached to\s+(.+?)(?:\[(\d+)\])?$/i.exec(line);
    if (attached) {
      attachTo.push({
        unit: units.length - 1,
        target: attached[1] ?? '',
        nth: Number(attached[2] ?? '1'),
      });
      continue;
    }
    const model = /^•\s*(\d+)x\s+(.+?)(?::\s*(.*))?$/.exec(line);
    if (model) {
      const count = Number(model[1]);
      group = { name: model[2] ?? '', count, wargear: [] };
      unit.groups.push(group);
      if (model[3] !== undefined) {
        for (const w of nrItems(model[3], count))
          addWargear(group.wargear, w.name, count === 1 ? w.count : w.count);
      }
      continue;
    }
    const withN = /^(\d+)\s+with\s+(.+)$/i.exec(line);
    if (withN && group) {
      for (const name of (withN[2] ?? '').split(/,\s*/))
        addWargear(group.wargear, name, Number(withN[1]));
    }
  }
  // "Attached to Skorpekh Lord[2]": the second unit of that name; the character attaches there.
  for (const { unit: bodyguard, target, nth } of attachTo) {
    const characters = units.flatMap((u, index) => (u.name === target ? [index] : []));
    const character = units[characters[nth - 1] ?? -1];
    if (character) character.attachedTo = bodyguard;
  }
  return units;
}

/** A list's units, read from the GW app or NewRecruit export; other text gives none. */
export function readListUnits(text: string): ListRead {
  const lines = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n');
  const army = parseArmyList(text).army;
  if (lines.some((line) => /^\+\s*FACTION KEYWORD:/i.test(line))) {
    return { army, units: newRecruit(lines) };
  }
  return { army, units: gwApp(lines) };
}
```

Note the NR "Attached to" semantics: the line sits under the **bodyguard** and names the **character**; the character's `attachedTo` becomes the bodyguard's index. (In `NR`, Lokhust Lord → unit 4, Skorpekh Lord #1 → 6, #2 → 7.) Simplify the two redundant ternaries above to plain values (`1`, `w.count`) when writing the file; they are left only to show intent.

Export from `index.ts`: `export * from './list-reader';`.

- [ ] **Step 4: Run them**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/list-reader.test.ts`
Expected: PASS (5 tests). If the GW title line ("Golden (2000 points)") is read as a unit, the battle-size search is wrong: units start after the `Strike Force (…)` line.

- [ ] **Step 5: Real-data check, then commit**

Read every list of a stored event through `readListUnits` in a throwaway Vitest file (not committed) and count lists with zero units by format; expected: GW app and NewRecruit lists all have units.

```bash
git add -A packages && git commit -m "feat: read a list's units, models, wargear and attachments (GW app and NewRecruit)"
```

---

### Task 3: Matching list units to datasheets

**Files:**

- Modify: `packages/shared/src/mathhammer/data.ts` (matched list schemas)
- Create: `packages/shared/src/mathhammer/list-match.ts`
- Test: `packages/shared/src/mathhammer/list-match.test.ts`
- Modify: `packages/shared/src/mathhammer/index.ts`

**Interfaces:**

- Consumes: `ListRead` (Task 2), `UnitData`, `factionFamily`, `canonicalArmy` is already applied by `parseArmyList`.
- Produces (schemas in `data.ts`):

```ts
export const MatchedGroupSchema = z.object({
  /** The datasheet model kind; null only when the datasheet has none. */
  modelId: z.string().nullable(),
  models: z.number().int(),
  weapons: z.array(z.object({ weaponId: z.string(), count: z.number().int() })),
});
export const MatchedUnitSchema = z.object({
  /** As written, with the model count: "Custodian Wardens ×5". */
  label: z.string(),
  name: z.string(),
  datasheetId: z.string().nullable(),
  groups: z.array(MatchedGroupSchema),
  attachedTo: z.number().int().nullable(),
  /** Wargear (or the unit) not found in the data. */
  unread: z.array(z.string()),
});
/** POST /api/mathhammer/list, GET /api/mathhammer/lists/:playerId. */
export const MathhammerListSchema = z.object({
  army: z.string().nullable(),
  units: z.array(MatchedUnitSchema),
  /** The datasheets the units use. */
  datasheets: z.array(UnitDatasheetSchema),
});
export type MatchedGroup = z.infer<typeof MatchedGroupSchema>;
export type MatchedUnit = z.infer<typeof MatchedUnitSchema>;
export type MathhammerList = z.infer<typeof MathhammerListSchema>;

export function matchList(read: ListRead, data: UnitData): MathhammerList;
```

- [ ] **Step 1: Write the failing tests** (`list-match.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { UnitData, UnitDatasheet } from './data';
import { matchList } from './list-match';

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

  it('turns a wargear name that is a model kind into models of that kind', () => {
    const list = matchList(
      {
        army: null,
        units: [
          {
            name: 'Intercessor Squad',
            points: 80,
            attachedTo: null,
            groups: [
              {
                name: null,
                count: 4,
                wargear: [
                  { name: 'Intercessor Sergeant', count: 1 },
                  { name: 'Bolt rifle', count: 4 },
                ],
              },
            ],
          },
        ],
      },
      data,
    );
    expect(list.units[0]?.groups).toEqual([
      { modelId: 'int-m', models: 4, weapons: [{ weaponId: 'br', count: 4 }] },
      { modelId: 'sgt', models: 1, weapons: [] },
    ]);
  });
});
```

- [ ] **Step 2: Run them**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/list-match.test.ts`
Expected: FAIL (`matchList` not found).

- [ ] **Step 3: Implement** (`list-match.ts`; schemas above go in `data.ts`)

```ts
import {
  factionFamily,
  type MatchedGroup,
  type MatchedUnit,
  type MathhammerList,
  type UnitData,
  type UnitDatasheet,
} from './data';
import type { ListModels, ListRead } from './list-reader';

/** Letters and digits only, accents dropped: "Khârn the Betrayer" → "kharnthebetrayer". */
const loose = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j] ?? 0;
      row[j] = Math.min(
        above + 1,
        (row[j - 1] ?? 0) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

/** Current datasheets before Legends. */
const currentFirst = (sheets: UnitDatasheet[]) => [
  ...sheets.filter((s) => !s.legends),
  ...sheets.filter((s) => s.legends),
];

/** The army family's datasheet (exact, loose, then up to 2 letters off), else any faction's. */
function findSheet(name: string, family: UnitDatasheet[], all: UnitDatasheet[]) {
  const key = loose(name);
  const exact = (sheets: UnitDatasheet[]) =>
    currentFirst(sheets).find((s) => s.name.toLowerCase() === name.toLowerCase()) ??
    currentFirst(sheets).find((s) => loose(s.name) === key);
  const typo =
    key.length >= 6
      ? currentFirst(family).find((s) => distance(loose(s.name), key) <= 2)
      : undefined;
  return exact(family) ?? typo ?? exact(all) ?? null;
}

const byName = <T extends { name: string }>(items: T[], name: string) =>
  items.find((i) => loose(i.name) === loose(name));

/** The model counts of the smallest size with this total, else all to the most numerous kind. */
function countsFor(sheet: UnitDatasheet, total: number): { modelId: string; count: number }[] {
  const size = sheet.sizes.find((s) => s.models.reduce((sum, m) => sum + m.count, 0) === total);
  if (size) return size.models.filter((m) => m.count > 0);
  const biggest =
    [...(sheet.sizes[0]?.models ?? [])].sort((a, b) => b.count - a.count)[0]?.modelId ??
    sheet.models[0]?.id;
  return biggest === undefined ? [] : [{ modelId: biggest, count: total }];
}

/** One list unit against its datasheet: model groups with weapon ids, and what wasn't found. */
function matchGroups(groups: ListModels[], sheet: UnitDatasheet) {
  const out: MatchedGroup[] = [];
  const unread: string[] = [];
  const onlyKind = sheet.models.length === 1 ? sheet.models[0]?.id : undefined;
  for (const group of groups) {
    const weapons: MatchedGroup['weapons'] = [];
    const extraModels: MatchedGroup[] = [];
    for (const item of group.wargear) {
      const weapon = byName(sheet.weapons, item.name);
      if (weapon) {
        weapons.push({ weaponId: weapon.id, count: item.count });
        continue;
      }
      const parts = item.name.split(/\s+and\s+/i).map((p) => byName(sheet.weapons, p));
      if (parts.length > 1 && parts.every((p) => p !== undefined)) {
        for (const p of parts) if (p) weapons.push({ weaponId: p.id, count: item.count });
        continue;
      }
      const kind = byName(sheet.models, item.name);
      if (kind) {
        extraModels.push({ modelId: kind.id, models: item.count, weapons: [] });
        continue;
      }
      if (!sheet.wargear.some((w) => loose(w) === loose(item.name))) unread.push(item.name);
    }
    const named = group.name === null ? undefined : byName(sheet.models, group.name);
    if (named || onlyKind !== undefined) {
      out.push({ modelId: named?.id ?? onlyKind ?? null, models: group.count, weapons });
    } else {
      // Unnamed models of several kinds: counts from the size, the weapons on the biggest kind.
      const kinds = countsFor(sheet, group.count);
      const biggest = [...kinds].sort((a, b) => b.count - a.count)[0]?.modelId;
      for (const k of kinds) {
        out.push({
          modelId: k.modelId,
          models: k.count,
          weapons: k.modelId === biggest ? weapons : [],
        });
      }
    }
    out.push(...extraModels);
  }
  return { groups: out, unread };
}

/** A list's units matched to datasheets: the army's family first, then any faction (allies). */
export function matchList(read: ListRead, data: UnitData): MathhammerList {
  const familyNames = read.army === null ? [] : factionFamily(read.army, data.factions);
  const family = data.datasheets.filter((d) => d.factions.some((f) => familyNames.includes(f)));
  const used = new Map<string, UnitDatasheet>();
  const units: MatchedUnit[] = read.units.map((unit) => {
    const total = unit.groups.reduce((sum, g) => sum + g.count, 0);
    const label = total > 1 ? `${unit.name} ×${String(total)}` : unit.name;
    const sheet = findSheet(unit.name, family, data.datasheets);
    if (sheet === null) {
      return {
        label,
        name: unit.name,
        datasheetId: null,
        groups: [],
        attachedTo: unit.attachedTo,
        unread: [unit.name],
      };
    }
    used.set(sheet.id, sheet);
    const { groups, unread } = matchGroups(unit.groups, sheet);
    return {
      label,
      name: unit.name,
      datasheetId: sheet.id,
      groups,
      attachedTo: unit.attachedTo,
      unread,
    };
  });
  return { army: read.army, units, datasheets: [...used.values()] };
}
```

Export from `index.ts`: `export * from './list-match';`.

- [ ] **Step 4: Run them**

Run: `pnpm vitest run --project shared packages/shared/src/mathhammer/list-match.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A packages && git commit -m "feat: match a list's units, models and weapons to 39k.pro datasheets"
```

---

### Task 4: List routes (paste, search stored lists, open one)

**Files:**

- Modify: `packages/shared/src/mathhammer/data.ts` (`StoredListSchema`, `MathhammerListsSchema`)
- Create: `apps/api/src/repo/mathhammer-lists.ts`
- Test: `apps/api/src/repo/mathhammer-lists.test.ts`
- Modify: `apps/api/src/routes/mathhammer.ts`
- Test: `apps/api/src/routes/mathhammer.test.ts` (exists from 2a; add cases)

**Interfaces:**

- Consumes: `readListUnits`, `matchList` (Tasks 2–3), `loadUnits` (2a), `findPlayerList(db, playerId)` (existing, returns `{ text, … } | null`), `storedCurrentList`.
- Produces:

```ts
// data.ts
export const StoredListSchema = z.object({
  playerId: z.string(),
  player: z.string(),
  event: z.string(),
  faction: z.string().nullable(),
  date: z.iso.datetime(),
});
export const MathhammerListsSchema = z.object({ lists: z.array(StoredListSchema) });
export type StoredList = z.infer<typeof StoredListSchema>;
// repo
export async function searchStoredLists(db: Db, search: string): Promise<StoredList[]>;
// routes
POST /api/mathhammer/list { text } → MathhammerList
GET  /api/mathhammer/lists?search= → { lists: StoredList[] }
GET  /api/mathhammer/lists/:playerId → MathhammerList
```

- [ ] **Step 1: Write the failing repo test** (`mathhammer-lists.test.ts`)

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client';
import { createTestDb, resetDb } from '../db/test-db';
import { syncEvent } from '../sync/jobs';
import { sampleSource } from '../test/helpers';
import { gwList, storeList } from '../test/lists';
import { searchStoredLists } from './mathhammer-lists';

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDb(db);
  await syncEvent({ db, source: sampleSource() }, 'EVTTEAM0001');
  await storeList(db, 'PL-ADA', gwList('Orks', 'War Horde'));
});

describe('searchStoredLists', () => {
  it('finds stored lists by player or event name, any case', async () => {
    const byPlayer = await searchStoredLists(db, 'ada');
    expect(byPlayer).toHaveLength(1);
    expect(byPlayer[0]).toMatchObject({ playerId: 'PL-ADA', faction: 'Orks' });
    const event = byPlayer[0]?.event ?? '';
    expect(await searchStoredLists(db, event.slice(0, 5).toUpperCase())).toHaveLength(1);
    expect(await searchStoredLists(db, 'nobody here')).toEqual([]);
  });

  it('needs at least two characters', async () => {
    expect(await searchStoredLists(db, 'a')).toEqual([]);
  });
});
```

(Check `PL-ADA`'s sample name contains "Ada"; if not, search by a substring of its stored name read from the `players` table in the test.)

- [ ] **Step 2: Run it**

Run: `pnpm vitest run --project api apps/api/src/repo/mathhammer-lists.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the repo**

```ts
import type { StoredList } from '@bcp/shared';
import { desc, ilike, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { armyLists, events, players } from '../db/schema';
import { armyRules } from './detachment-links';
import { storedCurrentList } from './lists';

/** Stored lists whose player or event name contains `search` (case ignored), newest first. */
export async function searchStoredLists(db: Db, search: string): Promise<StoredList[]> {
  const wanted = search.trim();
  if (wanted.length < 2) return [];
  const pattern = `%${wanted.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const [rows, rules] = await Promise.all([
    db
      .select({
        playerId: players.id,
        player: players.name,
        event: events.name,
        bcpFaction: players.faction,
        parsedArmy: armyLists.parsedArmy,
        detachments: armyLists.detachments,
        date: events.startDate,
      })
      .from(players)
      .innerJoin(armyLists, storedCurrentList)
      .innerJoin(events, sql`${events.id} = ${players.eventId}`)
      .where(or(ilike(players.name, pattern), ilike(events.name, pattern)))
      .orderBy(desc(events.startDate), players.name)
      .limit(20),
    armyRules(db),
  ]);
  return rows.map((row) => ({
    playerId: row.playerId,
    player: row.player,
    event: row.event,
    faction: rules.army(row.bcpFaction, row.parsedArmy, row.detachments ?? []).faction,
    date: row.date.toISOString(),
  }));
}
```

- [ ] **Step 4: Run it**

Run: `pnpm vitest run --project api apps/api/src/repo/mathhammer-lists.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests** (add to `apps/api/src/routes/mathhammer.test.ts`, which already stores the sample rules data and logs in like its 2a cases)

```ts
it('reads and matches a pasted list', async () => {
  const text = `T (2000 points)\n\nSpace Marines\nGladius Task Force (3 Detachment Points)\nTake and Hold\nStrike Force (2000 points)\n\nIntercessor Squad (80 points)\n  • 1x Intercessor Sergeant\n    • 1x Bolt rifle\n  • 4x Intercessor\n    • 4x Bolt rifle\n`;
  const response = await post('/api/mathhammer/list', { text });
  expect(response.status).toBe(200);
  const list = MathhammerListSchema.parse(await response.json());
  expect(list.units[0]).toMatchObject({ label: 'Intercessor Squad ×5', datasheetId: 'ds-int' });
  expect(list.datasheets.map((d) => d.name)).toEqual(['Intercessor Squad']);
});

it('searches stored lists and opens one', async () => {
  await syncEvent({ db, source: sampleSource() }, 'EVTTEAM0001');
  await storeList(db, 'PL-ADA', gwList('Space Marines', 'Gladius Task Force'));
  const found = MathhammerListsSchema.parse(
    await (await get('/api/mathhammer/lists?search=EVT')).json(),
  );
  expect(found.lists.length).toBeGreaterThanOrEqual(0);
  const opened = await get('/api/mathhammer/lists/PL-ADA');
  expect(opened.status).toBe(200);
  expect(MathhammerListSchema.parse(await opened.json()).army).toBe('Space Marines (Astartes)');
  expect((await get('/api/mathhammer/lists/NOPE')).status).toBe(404);
});

it('refuses an empty or huge pasted list', async () => {
  expect((await post('/api/mathhammer/list', { text: '' })).status).toBe(400);
  expect((await post('/api/mathhammer/list', { text: 'x'.repeat(60_001) })).status).toBe(400);
});
```

Use the file's existing `get`/`post` helpers (add a `post` like `matchups.test.ts`'s if missing), and replace the `EVT` search with a substring of the sample event's name so the first assertion is `toHaveLength(1)`.

- [ ] **Step 6: Run them**

Run: `pnpm vitest run --project api apps/api/src/routes/mathhammer.test.ts`
Expected: FAIL (404 for the new paths).

- [ ] **Step 7: Implement the routes** (in `mathhammerRoutes`, after `/mathhammer/units`)

```ts
    .post('/mathhammer/list', requireJson, async (c) => {
      const { text } = parseInput(
        z.object({ text: z.string().trim().min(1).max(60_000) }),
        await c.req.json<unknown>().catch(() => null),
      );
      return c.json(matchList(readListUnits(text), await unitData(deps.db)));
    })
    .get('/mathhammer/lists', async (c) =>
      c.json({ lists: await searchStoredLists(deps.db, c.req.query('search') ?? '') }),
    )
    .get('/mathhammer/lists/:playerId', async (c) => {
      const list = await findPlayerList(deps.db, c.req.param('playerId'));
      if (list?.text == null) throw new NotFoundError('No stored list for this player');
      return c.json(matchList(readListUnits(list.text), await unitData(deps.db)));
    });
```

Imports: `matchList`, `readListUnits` from `@bcp/shared`; `z` from `zod`; `parseInput` from `../validation`; `requireJson` from `./require-json`; `findPlayerList` from `../repo/lists`; `searchStoredLists` from `../repo/mathhammer-lists`.

- [ ] **Step 8: Run them**

Run: `pnpm vitest run --project api apps/api/src/routes/mathhammer.test.ts apps/api/src/repo/mathhammer-lists.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A apps packages && git commit -m "feat: list routes for Mathhammer: read a pasted list, search and open stored lists"
```

---

### Task 5: Form rows from a list unit

**Files:**

- Modify: `apps/web/src/features/mathhammer/datasheet-form.ts`
- Test: `apps/web/src/features/mathhammer/datasheet-form.test.ts`

**Interfaces:**

- Consumes: `MatchedUnit`, `MathhammerList` (Task 3); existing `attackerRows`, `defenderFrom` keep their signatures.
- Produces:

```ts
/** The attacker's weapons for a list unit and the characters attached to it. */
export function attackerRowsFromList(list: MathhammerList, index: number): WeaponRow[];
/** The defender from a list unit and the characters attached to it; switches kept. */
export function defenderFromList(
  list: MathhammerList,
  index: number,
  previous: DefenderForm,
): DefenderForm;
/** Units offered by the list picker: not the characters attached to another. */
export function pickableUnits(list: MathhammerList): { index: number; label: string }[];
```

- [ ] **Step 1: Write the failing tests** (append to `datasheet-form.test.ts`; `INTERCESSORS` and `CAPTAIN` are the 2a fixtures)

```ts
describe('list units', () => {
  const list: MathhammerList = {
    army: 'Space Marines (Astartes)',
    datasheets: [INTERCESSORS, CAPTAIN],
    units: [
      {
        label: 'Captain',
        name: 'Captain',
        datasheetId: CAPTAIN.id,
        attachedTo: 1,
        unread: [],
        groups: [
          {
            modelId: CAPTAIN.models[0]?.id ?? null,
            models: 1,
            weapons: [{ weaponId: CAPTAIN.weapons[0]?.id ?? '', count: 1 }],
          },
        ],
      },
      {
        label: 'Intercessor Squad ×5',
        name: 'Intercessor Squad',
        datasheetId: INTERCESSORS.id,
        attachedTo: null,
        unread: ['Twin dakkagun'],
        groups: INTERCESSORS.models.map((m, i) => ({
          modelId: m.id,
          models: i === 0 ? 1 : 4,
          weapons: [{ weaponId: INTERCESSORS.weapons[0]?.id ?? '', count: i === 0 ? 1 : 4 }],
        })),
      },
    ],
  };

  it('offers units, not the characters attached to them', () => {
    expect(pickableUnits(list)).toEqual([{ index: 1, label: 'Intercessor Squad ×5 + Captain' }]);
  });

  it('makes one weapon row per weapon with the list’s total, plus the attached character’s', () => {
    const rows = attackerRowsFromList(list, 1);
    expect(rows.map((r) => [r.name, r.models])).toEqual([
      [INTERCESSORS.weapons[0]?.name, 5],
      [`Captain: ${CAPTAIN.weapons[0]?.name ?? ''}`, 1],
    ]);
  });

  it('makes defender rows from the list’s model counts, the character as a CHARACTER row', () => {
    const defender = defenderFromList(list, 1, newDefender());
    expect(defender.groups.map((g) => [g.models, g.character])).toEqual([
      [5, false],
      [1, true],
    ]);
    expect(defender.source).toBe('Intercessor Squad + Captain');
    expect(defender.attached).toBe(true);
  });
});
```

(`newDefender` is the form-state helper the 2a tests use for an empty defender; use whatever name 2a's tests import. The two Intercessor kinds share a profile, so they join into one row of 5.)

- [ ] **Step 2: Run them**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer/datasheet-form.test.ts`
Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement** — refactor `rowsOf`/`groupsOf` to take explicit carried groups and counts, then add the list functions:

```ts
/** Models of one kind and the weapons they carry (how many of each). */
interface Carry {
  modelId: string | null;
  models: number;
  weapons: { weapon: UnitWeapon; count: number }[];
}

/** A size's model kinds with their default loadout. */
function defaultCarry(unit: UnitDatasheet, sizeIndex: number): Carry[] {
  const howMany = counts(unit, sizeIndex);
  const weapons = new Map(unit.weapons.map((w) => [w.id, w]));
  return unit.models.flatMap((model) => {
    const models = howMany.get(model.id) ?? 0;
    if (models === 0) return [];
    return [
      {
        modelId: model.id,
        models,
        weapons: unit.loadout.flatMap((entry) => {
          const weapon = weapons.get(entry.weaponId);
          return entry.modelId === model.id && weapon !== undefined
            ? [{ weapon, count: models * entry.count }]
            : [];
        }),
      },
    ];
  });
}

/** A list unit's groups with their weapons looked up. */
function listCarry(unit: UnitDatasheet, groups: MatchedGroup[]): Carry[] {
  const weapons = new Map(unit.weapons.map((w) => [w.id, w]));
  return groups.map((g) => ({
    modelId: g.modelId,
    models: g.models,
    weapons: g.weapons.flatMap((w) => {
      const weapon = weapons.get(w.weaponId);
      return weapon === undefined ? [] : [{ weapon, count: w.count }];
    }),
  }));
}
```

`rowsOf(unit, carry: Carry[], prefix)` does what it does today, iterating `carry` instead of `unit.models` × `loadout`: non-merged weapons add `count` (not `models * count`), and a group's merged melee row adds `group.models`. `attackerRows` calls it with `defaultCarry(sheet, sizeIndex)` / `defaultCarry(character, 0)`; existing 2a tests must stay green unchanged.

`groupsOf(unit, howMany: Map<string, number>, character)` takes the counts; `defenderFrom` passes `counts(sheet, sizeIndex)`.

```ts
const sheetOf = (list: MathhammerList, id: string | null) =>
  list.datasheets.find((d) => d.id === id);
const attachedTo = (list: MathhammerList, index: number) =>
  list.units.flatMap((u, i) => (u.attachedTo === index ? [i] : []));

export function pickableUnits(list: MathhammerList): { index: number; label: string }[] {
  return list.units.flatMap((unit, index) => {
    if (unit.attachedTo !== null || unit.datasheetId === null) return [];
    const names = attachedTo(list, index).map((i) => list.units[i]?.name ?? '');
    return [{ index, label: [unit.label, ...names].join(' + ') }];
  });
}

export function attackerRowsFromList(list: MathhammerList, index: number): WeaponRow[] {
  const unit = list.units[index];
  const sheet = sheetOf(list, unit?.datasheetId ?? null);
  if (unit === undefined || sheet === undefined) return [];
  return [
    ...rowsOf(sheet, listCarry(sheet, unit.groups), ''),
    ...attachedTo(list, index).flatMap((i) => {
      const character = list.units[i];
      const charSheet = sheetOf(list, character?.datasheetId ?? null);
      return character && charSheet
        ? rowsOf(charSheet, listCarry(charSheet, character.groups), `${character.name}: `)
        : [];
    }),
  ];
}

const countsOf = (groups: MatchedGroup[]) => {
  const howMany = new Map<string, number>();
  for (const g of groups)
    if (g.modelId !== null) howMany.set(g.modelId, (howMany.get(g.modelId) ?? 0) + g.models);
  return howMany;
};

export function defenderFromList(
  list: MathhammerList,
  index: number,
  previous: DefenderForm,
): DefenderForm {
  const unit = list.units[index];
  const sheet = sheetOf(list, unit?.datasheetId ?? null);
  if (unit === undefined || sheet === undefined) return previous;
  const characters = attachedTo(list, index).flatMap((i) => {
    const c = list.units[i];
    const s = sheetOf(list, c?.datasheetId ?? null);
    return c && s ? [{ unit: c, sheet: s }] : [];
  });
  const all = [sheet, ...characters.map((c) => c.sheet)];
  return {
    ...previous,
    source: [unit.name, ...characters.map((c) => c.unit.name)].join(' + '),
    groups: [
      ...groupsOf(sheet, countsOf(unit.groups), false),
      ...characters.flatMap((c) => groupsOf(c.sheet, countsOf(c.unit.groups), true)),
    ],
    keywords: [...new Set(all.flatMap((s) => s.keywords))].join(', '),
    attached: characters.length > 0,
    stealth: all.every((s) => s.stealth),
  };
}
```

- [ ] **Step 4: Run them**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer`
Expected: PASS, the 2a `datasheet-form` tests included.

- [ ] **Step 5: Commit**

```bash
git add -A apps && git commit -m "feat: Mathhammer rows from a list unit and its attached characters"
```

---

### Task 6: List queries and the list picker

**Files:**

- Modify: `apps/web/src/features/mathhammer/mathhammer-queries.ts`
- Create: `apps/web/src/features/mathhammer/ListPicker.tsx`
- Test: `apps/web/src/features/mathhammer/ListPicker.test.tsx`

**Interfaces:**

- Consumes: `MathhammerListSchema`, `MathhammerListsSchema` (Tasks 3–4), `pickableUnits` (Task 5), `apiGet`/`apiPost`.
- Produces:

```ts
export const readList: (text: string) => Promise<MathhammerList>;
export const storedListsQuery: (search: string) => QueryOptions<{ lists: StoredList[] }>;
export const storedListQuery: (playerId: string) => QueryOptions<MathhammerList>;
export function ListPicker(props: {
  label: string;
  onPick: (list: MathhammerList, index: number) => void;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests** (`ListPicker.test.tsx`)

```tsx
import type { MathhammerList } from '@bcp/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, stubFetchRoutes } from '../../test/render';
import { ListPicker } from './ListPicker';
import { CAPTAIN, INTERCESSORS } from './unit-fixtures';

const list: MathhammerList = {
  army: 'Space Marines (Astartes)',
  datasheets: [INTERCESSORS, CAPTAIN],
  units: [
    {
      label: 'Captain',
      name: 'Captain',
      datasheetId: CAPTAIN.id,
      attachedTo: 1,
      unread: ['Relic shield'],
      groups: [],
    },
    {
      label: 'Intercessor Squad ×5',
      name: 'Intercessor Squad',
      datasheetId: INTERCESSORS.id,
      attachedTo: null,
      unread: ['Twin dakkagun'],
      groups: [],
    },
    {
      label: 'Made Up',
      name: 'Made Up',
      datasheetId: null,
      attachedTo: null,
      unread: ['Made Up'],
      groups: [],
    },
  ],
};

describe('ListPicker', () => {
  it('reads a pasted list, offers its units, says what it couldn’t read, and uses the pick', async () => {
    const fetchMock = stubFetchRoutes({ 'POST /api/mathhammer/list': list });
    const onPick = vi.fn();
    renderWithProviders(<ListPicker label="Attacker" onPick={onPick} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Attacker list' }), {
      target: { value: 'my list' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read list' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const unit = await screen.findByRole('textbox', { name: 'Attacker list unit' });
    fireEvent.click(unit);
    fireEvent.click(await screen.findByRole('option', { name: 'Intercessor Squad ×5 + Captain' }));
    expect(screen.getByText('Couldn’t read: Twin dakkagun, Relic shield')).toBeInTheDocument();
    expect(screen.getByText('Couldn’t read: Made Up')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(onPick).toHaveBeenCalledWith(list, 1);
  });

  it('says when a list has no units it can read', async () => {
    stubFetchRoutes({ 'POST /api/mathhammer/list': { army: null, units: [], datasheets: [] } });
    renderWithProviders(<ListPicker label="Defender" onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Defender list' }), {
      target: { value: '* [L1] Farsight [70]' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read list' }));
    expect(await screen.findByText('No units found in this list')).toBeInTheDocument();
  });

  it('finds a stored BCP list by player or event and opens it', async () => {
    stubFetchRoutes({
      'GET /api/mathhammer/lists/PL-1': list,
      'GET /api/mathhammer/lists': {
        lists: [
          {
            playerId: 'PL-1',
            player: 'Ada',
            event: 'Big GT',
            faction: 'Space Marines (Astartes)',
            date: '2026-09-01T00:00:00.000Z',
          },
        ],
      },
    });
    renderWithProviders(<ListPicker label="Attacker" onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Pick from BCP' }));
    const search = screen.getByRole('textbox', { name: 'Attacker BCP list' });
    fireEvent.change(search, { target: { value: 'Ada' } });
    fireEvent.click(await screen.findByRole('option', { name: /Ada · Big GT/ }));
    expect(await screen.findByRole('textbox', { name: 'Attacker list unit' })).toBeInTheDocument();
  });
});
```

(The unread line shows the picked unit's and its attached characters' names; a unit not found in the data shows its own name.)

- [ ] **Step 2: Run them**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer/ListPicker.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the queries**

```ts
export const readList = (text: string) =>
  apiPost('/api/mathhammer/list', { text }, MathhammerListSchema);

export const storedListsQuery = (search: string) =>
  queryOptions({
    queryKey: ['mathhammer', 'lists', search],
    queryFn: () =>
      apiGet(`/api/mathhammer/lists?search=${encodeURIComponent(search)}`, MathhammerListsSchema),
    enabled: search.trim().length >= 2,
  });

export const storedListQuery = (playerId: string) =>
  queryOptions({
    queryKey: ['mathhammer', 'list', playerId],
    queryFn: () =>
      apiGet(`/api/mathhammer/lists/${encodeURIComponent(playerId)}`, MathhammerListSchema),
  });
```

- [ ] **Step 4: Implement `ListPicker.tsx`**

```tsx
import type { MathhammerList } from '@bcp/shared';
import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { pickableUnits } from './datasheet-form';
import { readList, storedListQuery, storedListsQuery } from './mathhammer-queries';

/** Names a list unit and its attached characters couldn't read. */
const unreadOf = (list: MathhammerList, index: number) =>
  [index, ...list.units.flatMap((u, i) => (u.attachedTo === index ? [i] : []))].flatMap(
    (i) => list.units[i]?.unread ?? [],
  );

/**
 * Picks a unit from an army list: pasted (GW app or NewRecruit export) or a stored BCP list found
 * by player or event. "Use" fills the side.
 */
export function ListPicker({
  label,
  onPick,
}: {
  label: string;
  onPick: (list: MathhammerList, index: number) => void;
}) {
  const [from, setFrom] = useState<'paste' | 'bcp'>('paste');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [unitIndex, setUnitIndex] = useState<string | null>(null);
  const pasted = useMutation({ mutationFn: readList });
  const found = useQuery(storedListsQuery(debounced));
  const stored = useQuery({ ...storedListQuery(playerId ?? ''), enabled: playerId !== null });
  const list = from === 'paste' ? pasted.data : stored.data;
  const error = from === 'paste' ? pasted.error : (stored.error ?? found.error);
  const units = list ? pickableUnits(list) : [];
  const index = unitIndex === null ? null : Number(unitIndex);
  const unread = list && index !== null ? unreadOf(list, index) : [];
  const notFound = list?.units.filter((u) => u.datasheetId === null).map((u) => u.name) ?? [];

  return (
    <Stack gap="xs">
      <SegmentedControl
        size="xs"
        aria-label={`${label} list source`}
        data={[
          { value: 'paste', label: 'Paste' },
          { value: 'bcp', label: 'Pick from BCP' },
        ]}
        value={from}
        onChange={(value) => {
          setFrom(value === 'bcp' ? 'bcp' : 'paste');
          setUnitIndex(null);
        }}
      />
      {from === 'paste' ? (
        <Group gap="xs" align="flex-end">
          <Textarea
            size="xs"
            label={`${label} list`}
            placeholder="Paste a list from the GW app or NewRecruit"
            autosize
            minRows={2}
            maxRows={6}
            w={360}
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
          />
          <Button
            size="xs"
            loading={pasted.isPending}
            disabled={text.trim() === ''}
            onClick={() => {
              setUnitIndex(null);
              pasted.mutate(text);
            }}
          >
            Read list
          </Button>
        </Group>
      ) : (
        <Select
          size="xs"
          label={`${label} BCP list`}
          placeholder="Player or event"
          searchable
          w={360}
          searchValue={search}
          onSearchChange={setSearch}
          filter={({ options }) => options}
          data={(found.data?.lists ?? []).map((l) => ({
            value: l.playerId,
            label: `${l.player} · ${l.event}${l.faction === null ? '' : ` · ${l.faction}`}`,
          }))}
          nothingFoundMessage={
            debounced.trim().length < 2 ? 'Type 2 letters or more' : 'No lists found'
          }
          value={playerId}
          onChange={(value) => {
            setPlayerId(value);
            setUnitIndex(null);
          }}
        />
      )}
      {error && (
        <Alert color="red" role="alert">
          {error.message}
        </Alert>
      )}
      {list && units.length === 0 && (
        <Text size="sm" c="dimmed">
          No units found in this list
        </Text>
      )}
      {units.length > 0 && (
        <Group gap="xs" align="flex-end">
          <Select
            size="xs"
            label={`${label} list unit`}
            searchable
            w={360}
            data={units.map((u) => ({ value: String(u.index), label: u.label }))}
            value={unitIndex}
            onChange={setUnitIndex}
          />
          <Button
            size="xs"
            disabled={index === null || list === undefined}
            onClick={() => {
              if (list !== undefined && index !== null) onPick(list, index);
            }}
          >
            Use
          </Button>
        </Group>
      )}
      {unread.length > 0 && (
        <Text size="xs" c="dimmed">{`Couldn’t read: ${unread.join(', ')}`}</Text>
      )}
      {notFound.length > 0 && (
        <Text size="xs" c="dimmed">{`Couldn’t read: ${notFound.join(', ')}`}</Text>
      )}
    </Stack>
  );
}
```

- [ ] **Step 5: Run them**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer/ListPicker.test.tsx`
Expected: PASS (3 tests). If Mantine's Select needs a click on its input to open in tests, follow the 2a `MathhammerPage.test.tsx` pattern for picking options.

- [ ] **Step 6: Commit**

```bash
git add -A apps && git commit -m "feat: list picker for Mathhammer: paste a list or find a stored BCP list"
```

---

### Task 7: "From a list" on both sides of the page

**Files:**

- Modify: `apps/web/src/features/mathhammer/AttackerPanel.tsx`, `DefenderPanel.tsx`
- Test: `apps/web/src/features/mathhammer/MathhammerPage.test.tsx`

**Interfaces:**

- Consumes: `ListPicker` (Task 6), `attackerRowsFromList`, `defenderFromList` (Task 5).

- [ ] **Step 1: Write the failing page test** (in `MathhammerPage.test.tsx`, with the file's existing stubs for factions and units)

```tsx
it('fills the attacker from a pasted list unit, its attached character’s weapons included', async () => {
  stubFetchRoutes({
    ...routes, // the file's existing factions/units stubs
    'POST /api/mathhammer/list': LIST, // a MathhammerList: Intercessor Squad ×5 led by a Captain
  });
  renderWithProviders(<MathhammerPage />);
  fireEvent.click(screen.getAllByRole('radio', { name: 'From a list' })[0] as HTMLElement);
  fireEvent.change(screen.getByRole('textbox', { name: 'Attacker list' }), {
    target: { value: 'list' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read list' }));
  fireEvent.click(await screen.findByRole('textbox', { name: 'Attacker list unit' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Intercessor Squad ×5 + Captain' }));
  fireEvent.click(screen.getByRole('button', { name: 'Use' }));
  expect(
    await screen.findByText('From datasheet: Intercessor Squad + Captain'),
  ).toBeInTheDocument();
  expect(screen.getByDisplayValue(/Captain: /)).toBeInTheDocument();
});

it('fills the defender from a list unit', async () => {
  // same LIST; the Defender panel's "From a list"; expect "From datasheet: Intercessor Squad + Captain"
  // under the defender and a CHARACTER model row.
});
```

Write the second test out in full in the same shape as the first (Defender labels: "Defender list", "Defender list unit"; assert the defender's source line and that a model row is marked as a character, using the same query the 2a page test uses for character rows). Define `LIST` at the top of the file from `INTERCESSORS` and `CAPTAIN` exactly like Task 5's `list` fixture. Replace `as HTMLElement` with a `getAllByRole(...)[0]` guard if eslint rejects the cast (2a hit this rule; use the guard-and-throw pattern).

- [ ] **Step 2: Run it**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer/MathhammerPage.test.tsx`
Expected: FAIL (no "From a list" radio).

- [ ] **Step 3: Implement** — in each panel, above the picker:

```tsx
const [from, setFrom] = useState<'unit' | 'list'>('unit');
…
<SegmentedControl
  size="xs"
  aria-label="Attacker source"
  data={[
    { value: 'unit', label: 'Any unit' },
    { value: 'list', label: 'From a list' },
  ]}
  value={from}
  onChange={(value) => {
    setFrom(value === 'list' ? 'list' : 'unit');
  }}
/>
{from === 'unit' ? (
  <UnitPicker … as today … />
) : (
  <ListPicker
    label="Attacker"
    onPick={(list, index) => {
      const unit = list.units[index];
      const attached = list.units.filter((u) => u.attachedTo === index).map((u) => u.name);
      onChange({
        ...form,
        source: [unit?.name ?? '', ...attached].join(' + '),
        weapons: attackerRowsFromList(list, index),
      });
    }}
  />
)}
```

Defender: `aria-label="Defender source"`, `onPick={(list, index) => { onChange(defenderFromList(list, index, defender)); }}`.

- [ ] **Step 4: Run the page tests, then the whole check**

Run: `pnpm vitest run --project web apps/web/src/features/mathhammer && pnpm check`
Expected: PASS; full check green.

- [ ] **Step 5: Real-data check in the browser**

On the dev server: paste a real GW-app list (one with "Attached Units") and a NewRecruit list; pick a bodyguard unit with a leader; the attacker shows the unit's and the leader's weapon rows with the list's counts; "Couldn't read" lists only real gaps. Pick from BCP by an event name; open a list; pick a unit for the defender.

- [ ] **Step 6: Commit**

```bash
git add -A apps && git commit -m "feat: Mathhammer sides can be filled from a pasted or stored list"
```

---

## Self-Review

- **Spec coverage:** §2 From a list (paste and BCP search, units as written, counts, attached characters, couldn't read) → Tasks 2–3, 5–7. §5 full-list reader (points, model lines, wargear counts, attachments; enhancement and warlord are skipped, not needed for maths) and matching (family first, typos only there, allies, non-Legends first, joined names "A and B") → Tasks 2–3. §6 list routes → Task 4. §8 tests: list reader on real formats incl. Leader and Support (Task 2), matching incl. Legends/allies/typos (Task 3), API routes (Task 4), page picking/loadout counts/attached/unread (Tasks 5–7).
- **Placeholders:** Task 7's defender test is described against the first test's exact shape and must be written in full when executed; the reader code's two redundant ternaries are flagged for simplification.
- **Type consistency:** `ListRead`/`ListUnit`/`ListModels` (Task 2) → `matchList` (Task 3) → `MathhammerList`/`MatchedUnit`/`MatchedGroup` (Tasks 3–7); `pickableUnits`, `attackerRowsFromList(list, index)`, `defenderFromList(list, index, previous)` (Task 5) → Tasks 6–7.
- **Review Focus** lines are each pinned: unreadable formats (Tasks 2, 6), allies/Legends (3), same weapon over kinds (3, 5), NewRecruit index attachments (2), typos/accents (3).
