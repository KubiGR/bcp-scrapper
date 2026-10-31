import {
  DEFAULT_MODS,
  type Defender,
  type Situation,
  type Weapon,
  type WeaponMods,
} from '@bcp/shared';
import {
  defenderChanges,
  defenderOriginalText,
  groupChanges,
  groupOriginalText,
  originalText,
  weaponChanges,
  type MathhammerForm,
} from './form-state';

const REROLL: Record<string, string> = { ones: '1s', failures: 'fails', fish: 'non-criticals' };
const signed = (n: number) => (n > 0 ? `+${String(n)}` : String(n));

/** The switches that differ from the defaults, as short labels. */
export function modLabels(mods: WeaponMods): string[] {
  const d = DEFAULT_MODS;
  const out: string[] = [];
  const add = (when: boolean, label: string) => {
    if (when) out.push(label);
  };
  add(mods.attacksModifier !== 0, `Attacks ${signed(mods.attacksModifier)}`);
  add(mods.skillModifier !== 0, `BS/WS ${signed(mods.skillModifier)}`);
  add(mods.strengthModifier !== 0, `Strength ${signed(mods.strengthModifier)}`);
  add(mods.torrent, 'Torrent');
  add(mods.hitReroll !== d.hitReroll, `Re-roll hits: ${REROLL[mods.hitReroll] ?? mods.hitReroll}`);
  add(mods.hitRerollOneDie, 'Re-roll one hit');
  add(mods.hitModifier !== 0, `${signed(mods.hitModifier)} to hit`);
  add(mods.hitIgnorePenalties, 'Ignores hit penalties');
  add(mods.critHitOn !== d.critHitOn, `Critical hits ${String(mods.critHitOn)}+`);
  add(mods.sustainedHits !== null, `Sustained Hits ${mods.sustainedHits ?? ''}`);
  add(mods.lethalHits, 'Lethal Hits');
  add(mods.ignoresCover, 'Ignores Cover');
  add(
    mods.woundReroll !== d.woundReroll,
    `Re-roll wounds: ${REROLL[mods.woundReroll] ?? mods.woundReroll}`,
  );
  add(mods.woundRerollOneDie, 'Re-roll one wound');
  add(mods.woundModifier !== 0, `${signed(mods.woundModifier)} to wound`);
  add(mods.woundIgnorePenalties, 'Ignores wound penalties');
  add(mods.critWoundOn !== d.critWoundOn, `Critical wounds ${String(mods.critWoundOn)}+`);
  add(mods.critAp !== 0, `Critical AP ${signed(-mods.critAp)}`);
  add(mods.critDamage !== 0, `Critical D ${signed(mods.critDamage)}`);
  add(mods.devastatingWounds, 'Devastating Wounds');
  add(mods.apImprove !== 0, `AP improved by ${String(mods.apImprove)}`);
  add(mods.saveModifier !== 0, `Saves worse by ${String(mods.saveModifier)}`);
  add(mods.damageReroll, 'Re-roll damage');
  add(mods.damageRerollOneDie, 'Re-roll one damage');
  add(mods.damageModifier !== 0, `Damage ${signed(mods.damageModifier)}`);
  add(mods.ignoreDamageReduction, 'Ignores damage reduction');
  return out;
}

/** A weapon as used: "3× Chainblades", its profile, and its keywords and switches. */
export function weaponSummary(w: Weapon): { name: string; stats: string; tags: string[] } {
  const skill = w.skill === null ? '–' : `${String(w.skill)}+`;
  const tags = [
    ...w.anti.map((a) =>
      a.keyword === '*' ? `Anti ${String(a.value)}+` : `Anti-${a.keyword} ${String(a.value)}+`,
    ),
    ...(w.rapidFire === null ? [] : [`Rapid Fire ${w.rapidFire}`]),
    ...(w.blast === null ? [] : [`Blast${w.blast > 1 ? ` ${String(w.blast)}` : ''}`]),
    ...(w.cleave === null ? [] : [`Cleave ${String(w.cleave)}`]),
    ...(w.melta === null ? [] : [`Melta ${String(w.melta)}`]),
    ...(w.heavy ? ['Heavy'] : []),
    ...(w.lance ? ['Lance'] : []),
    ...(w.precision ? ['Precision'] : []),
    ...(w.indirectFire ? ['Indirect Fire'] : []),
    ...modLabels(w.mods),
  ];
  return {
    name: `${String(w.models)}× ${w.name}`,
    stats: `A ${w.attacks} · ${w.melee ? 'WS' : 'BS'} ${skill} · S ${String(w.strength)} · AP ${String(w.ap)} · D ${w.damage}`,
    tags,
  };
}

/** The defender's models, one line per kind, and what protects them. */
export function defenderSummary(d: Defender): { models: string[]; tags: string[] } {
  return {
    models: d.groups.map((g) =>
      [
        `${String(g.models)}× ${g.name}${g.character ? ' (Character)' : ''}`,
        `T ${String(g.toughness)}`,
        g.save >= 7 ? 'No save' : `Sv ${String(g.save)}+`,
        ...(g.invuln === null
          ? []
          : [`${String(g.invuln)}++${g.invulnAgainst === 'all' ? '' : ` vs ${g.invulnAgainst}`}`]),
        `W ${String(g.wounds)}`,
        ...(g.fnp === null ? [] : [`FNP ${String(g.fnp)}+`]),
      ].join(' · '),
    ),
    tags: [
      ...(d.attached ? ['Attached unit'] : []),
      ...(d.stealth ? ['Stealth'] : []),
      ...(d.hitModifier !== 0 ? [`${signed(d.hitModifier)} to be hit`] : []),
      ...(d.woundModifier !== 0 ? [`${signed(d.woundModifier)} to be wounded`] : []),
      ...(d.halveDamage ? ['Halve damage'] : []),
      ...(d.damageReduction > 0 ? [`Damage −${String(d.damageReduction)}`] : []),
      ...(d.savePenaltiesIgnored ? ['Save penalties ignored'] : []),
      ...d.keywords,
    ],
  };
}

const SITUATION_LABELS: Record<keyof Situation, string> = {
  movedOver3: 'Moved more than 3"',
  halfRange: 'Half range',
  charged: 'Charged',
  plungingFire: 'Plunging fire',
  snapShooting: 'Snap shooting',
  indirectShooting: 'Indirect shooting',
  indirectStationaryVisible: 'Stayed still, target seen by a friend',
  attackerDamaged: 'Attacker damaged',
  cover: 'Target in cover',
  armourOfContempt: 'Armour of Contempt',
};

/** The situation's ticked boxes, as labels. */
export const situationLabels = (situation: Situation): string[] =>
  (Object.keys(SITUATION_LABELS) as (keyof Situation)[])
    .filter((key) => situation[key])
    .map((key) => SITUATION_LABELS[key]);

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  models: 'Weapons',
  melee: 'Melee',
  attacks: 'Attacks',
  skill: 'BS/WS',
  strength: 'S',
  ap: 'AP',
  damage: 'D',
  profile: 'Profile',
  torrent: 'Torrent',
  lethalHits: 'Lethal Hits',
  sustainedHits: 'Sustained Hits',
  devastatingWounds: 'Devastating Wounds',
  twinLinked: 'Twin-linked',
  heavy: 'Heavy',
  lance: 'Lance',
  ignoresCover: 'Ignores Cover',
  precision: 'Precision',
  indirectFire: 'Indirect Fire',
  rapidFire: 'Rapid Fire',
  blast: 'Blast',
  cleave: 'Cleave',
  melta: 'Melta',
  anti: 'Anti',
  toughness: 'T',
  save: 'Sv',
  invuln: 'InSv',
  invulnAgainst: 'InSv vs',
  wounds: 'W',
  fnp: 'FNP',
  character: 'Character',
  keywords: 'Keywords',
  attached: 'Attached unit',
  stealth: 'Stealth',
  damageReduction: 'Damage −',
  halveDamage: 'Halve damage',
};

const valueText = (value: unknown) =>
  typeof value === 'boolean'
    ? value
      ? 'on'
      : 'off'
    : value === null || value === ''
      ? '–'
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : JSON.stringify(value);

const change = (field: string, now: unknown, was: string | null) =>
  `${FIELD_LABELS[field] ?? field} ${valueText(now)} (was ${was ?? '–'})`;

/**
 * What was set on top of the datasheets and the starting setup, one line per part: the unit's
 * modifiers, the situation, each weapon's and the defender's edited fields.
 */
export function appliedModifiers(form: MathhammerForm): string[] {
  const lines: string[] = [];
  const unit = modLabels(form.unit);
  if (unit.length > 0) lines.push(`Unit: ${unit.join(' · ')}`);
  // Every box ticked, the starting ones (half range, cover) too: the picture says what was used.
  const situation = situationLabels(form.situation);
  if (situation.length > 0) lines.push(`Situation: ${situation.join(' · ')}`);
  for (const w of form.weapons) {
    if (w.original === null) {
      lines.push(`${w.name}: added by hand`);
      continue;
    }
    const edits = weaponChanges(w).map((field) => change(field, w[field], originalText(w, field)));
    if (edits.length > 0) lines.push(`${w.name}: ${edits.join(' · ')}`);
  }
  const d = form.defender;
  const defender = defenderChanges(d).map((field) =>
    change(field, d[field], defenderOriginalText(d, field)),
  );
  if (defender.length > 0) lines.push(`Defender: ${defender.join(' · ')}`);
  for (const g of d.groups) {
    if (g.original === null) {
      lines.push(`${g.name}: added by hand`);
      continue;
    }
    const edits = groupChanges(g).map((field) =>
      change(field, g[field], groupOriginalText(g, field)),
    );
    if (edits.length > 0) lines.push(`${g.name}: ${edits.join(' · ')}`);
  }
  return lines;
}
