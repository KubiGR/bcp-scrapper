/** A unit line: `Name (90 Points)`, `Name (90 pts)`, `Name x6 (140 pts)`. */
const UNIT = /^(.+?)\s*\((\d{1,4})\s*(?:points?|pts)\.?\)\s*$/i;
/** A bullet under a unit: `• 9x Purifier` (a model or a weapon), with its indent. */
const BULLET = /^(\s*)[•\-*]\s*(?:(\d+)x\s+)?(.+)$/;
/** A sub-bullet (a model's weapon): `◦ 1x Storm bolter`. */
const SUB = /^\s*◦/;
/** `Warbikers x6`: the model count in the name. */
const COUNT_IN_NAME = /^(.+?)\s+x(\d+)$/i;

interface Unit {
  name: string;
  models: number;
}

/**
 * The units of an army list, short: one line per unit with its models when there are several
 * ("10 Purifier Squad"), repeats merged ("2x5 Strike Squad", "2x Nemesis Dreadknight"), in list
 * order. Reads the GW app export (a unit's model bullets carry sub-bullets for their weapons) and
 * the plain "Unit xN (points)" style; empty when nothing reads as a unit.
 */
export function shortList(text: string | null): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const units: Unit[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = UNIT.exec(lines[i]?.trim() ?? '');
    if (!match) continue;
    const points = Number(match[2]);
    // Titles and battle sizes ("Strike Force (2,000 Points)", "My list (1995 Points)").
    if (points >= 1000) continue;
    let name = (match[1] ?? '').trim();
    let models = 1;
    const inName = COUNT_IN_NAME.exec(name);
    if (inName) {
      name = (inName[1] ?? name).trim();
      models = Number(inName[2]);
    }
    // The bullets under it: models when any of them lists its own weapons.
    let counted = 0;
    let multiModel = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j] ?? '';
      if (line.trim() === '' || UNIT.test(line.trim())) break;
      if (SUB.test(line)) {
        multiModel = true;
        continue;
      }
      const bullet = BULLET.exec(line);
      if (bullet) counted += Number(bullet[2] ?? 1);
    }
    if (multiModel) models = counted;
    units.push({ name, models });
  }
  // Repeats merged where the first one stood.
  const merged: { unit: Unit; times: number }[] = [];
  for (const unit of units) {
    const same = merged.find((m) => m.unit.name === unit.name && m.unit.models === unit.models);
    if (same) same.times += 1;
    else merged.push({ unit, times: 1 });
  }
  return merged.map(({ unit, times }) => {
    const models = unit.models > 1 ? String(unit.models) : '';
    if (times === 1) return models ? `${models} ${unit.name}` : unit.name;
    return models ? `${String(times)}x${models} ${unit.name}` : `${String(times)}x ${unit.name}`;
  });
}
