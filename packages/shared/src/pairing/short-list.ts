/**
 * A unit line: `Name (90 Points)`, `Name (90 pts)`, `Name x6 (140 pts)`, and the count-first style
 * with its gear after the points: `5x Name (260 pts): Vexilla`.
 */
const UNIT = /^(.+?)\s*\((\d{1,4})\s*(?:points?|pts)\.?\)\s*(?::.*)?$/i;
/** A bullet under a unit: `• 9x Purifier` (a model or a weapon), with its indent. */
const BULLET = /^(\s*)[•\-*]\s*(?:(\d+)x\s+)?(.+)$/;
/** A sub-bullet (a model's weapon): `◦ 1x Storm bolter`. */
const SUB = /^\s*◦/;
/** `Warbikers x6`: the model count in the name. */
const COUNT_IN_NAME = /^(.+?)\s+x(\d+)$/i;
/** `5x Custodian Wardens`: the model count before the name. */
const COUNT_FIRST = /^(\d+)x\s+(.+)$/i;
/** `Char1: `: a character's place in the count-first style. */
const CHARACTER_TAG = /^char\d+:\s*/i;

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
    let name = (match[1] ?? '').trim().replace(CHARACTER_TAG, '');
    let models = 1;
    const inName = COUNT_IN_NAME.exec(name);
    const first = COUNT_FIRST.exec(name);
    if (inName) {
      name = (inName[1] ?? name).trim();
      models = Number(inName[2]);
    } else if (first) {
      name = (first[2] ?? name).trim();
      models = Number(first[1]);
    }
    // The bullets under it: models when any of them lists its own weapons. Models are the
    // counted bullets ("• 9x Khorne Berzerker") up to the last one with its own "◦" gear; extras
    // after it ("• 1x Icon of Khorne") and uncounted ones ("• Attached as: Bodyguard") aren't.
    const bullets: { count: number; gear: boolean }[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j] ?? '';
      if (line.trim() === '' || UNIT.test(line.trim())) break;
      const last = bullets.at(-1);
      if (SUB.test(line)) {
        if (last) last.gear = true;
        continue;
      }
      const bullet = BULLET.exec(line);
      if (bullet) bullets.push({ count: bullet[2] ? Number(bullet[2]) : 0, gear: false });
    }
    const lastModel = bullets.findLastIndex((b) => b.gear);
    const multiModel = lastModel !== -1;
    const counted = bullets.slice(0, lastModel + 1).reduce((sum, b) => sum + b.count, 0);
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
