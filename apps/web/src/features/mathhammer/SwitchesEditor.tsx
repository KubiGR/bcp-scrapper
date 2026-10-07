import { DEFAULT_MODS, type Reroll, type WeaponMods } from '@bcp/shared';
import { Button, Fieldset, Group, Stack } from '@mantine/core';
import {
  Check,
  CritSelect,
  DiceInput,
  ModifierSelect,
  Num,
  RerollSelect,
  rerollLabel,
} from './inputs';
import classes from './SwitchesEditor.module.css';

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
  /** The default, as the field shows it, when the switch differs from it; null when not. */
  const changed = (
    key: keyof WeaponMods,
    kind: 'reroll' | 'modifier' | 'crit' | 'flag' | 'number' | 'text',
  ): string | null => {
    const value = DEFAULT_MODS[key];
    if (unit[key] === value) return null;
    if (kind === 'reroll') return rerollLabel(value as Reroll);
    if (kind === 'crit') return `${String(value)}+`;
    if (kind === 'flag') return value === true ? 'on' : 'off';
    if (kind === 'modifier') return Number(value) > 0 ? `+${String(value)}` : String(value);
    return value === null || value === '' ? '–' : String(value);
  };
  const anyChanged = (Object.keys(DEFAULT_MODS) as (keyof WeaponMods)[]).some(
    (key) => unit[key] !== DEFAULT_MODS[key],
  );
  return (
    <Stack gap="xs">
      {anyChanged && (
        <Group>
          <Button
            size="compact-xs"
            variant="subtle"
            color="yellow"
            onClick={() => {
              onChange(DEFAULT_MODS);
            }}
          >
            Reset modifiers
          </Button>
        </Group>
      )}
      <Fieldset legend="Hit roll" variant="filled" p="sm" classNames={{ legend: classes.legend }}>
        <Group gap="xs" align="flex-end">
          <RerollSelect
            original={changed('hitReroll', 'reroll')}
            from="Default"
            label="Re-roll hits"
            value={unit.hitReroll}
            onChange={(v) => {
              set({ hitReroll: v });
            }}
          />
          <Check
            original={changed('hitRerollOneDie', 'flag')}
            from="Default"
            boxed
            label="Re-roll one hit"
            checked={unit.hitRerollOneDie}
            onChange={(v) => {
              set({ hitRerollOneDie: v });
            }}
          />
          <ModifierSelect
            original={changed('hitModifier', 'modifier')}
            from="Default"
            label="To hit"
            value={unit.hitModifier}
            onChange={(v) => {
              set({ hitModifier: v });
            }}
          />
          <Check
            original={changed('hitIgnorePenalties', 'flag')}
            from="Default"
            boxed
            label="Ignore hit penalties"
            checked={unit.hitIgnorePenalties}
            onChange={(v) => {
              set({ hitIgnorePenalties: v });
            }}
          />
          <CritSelect
            original={changed('critHitOn', 'crit')}
            from="Default"
            label="Critical hit"
            value={unit.critHitOn}
            onChange={(v) => {
              set({ critHitOn: v });
            }}
          />
          <DiceInput
            original={changed('sustainedHits', 'text')}
            from="Default"
            label="Sustained Hits"
            value={unit.sustainedHits ?? ''}
            w={96}
            onChange={(v) => {
              set({ sustainedHits: v.trim() === '' ? null : v.trim() });
            }}
          />
          <Check
            original={changed('lethalHits', 'flag')}
            from="Default"
            boxed
            label="Lethal Hits"
            checked={unit.lethalHits}
            onChange={(v) => {
              set({ lethalHits: v });
            }}
          />
          <Check
            original={changed('ignoresCover', 'flag')}
            from="Default"
            boxed
            label="Ignores Cover"
            checked={unit.ignoresCover}
            onChange={(v) => {
              set({ ignoresCover: v });
            }}
          />
        </Group>
      </Fieldset>
      <Fieldset legend="Wound roll" variant="filled" p="sm" classNames={{ legend: classes.legend }}>
        <Group gap="xs" align="flex-end">
          <RerollSelect
            original={changed('woundReroll', 'reroll')}
            from="Default"
            label="Re-roll wounds"
            value={unit.woundReroll}
            onChange={(v) => {
              set({ woundReroll: v });
            }}
          />
          <Check
            original={changed('woundRerollOneDie', 'flag')}
            from="Default"
            boxed
            label="Re-roll one wound"
            checked={unit.woundRerollOneDie}
            onChange={(v) => {
              set({ woundRerollOneDie: v });
            }}
          />
          <ModifierSelect
            original={changed('woundModifier', 'modifier')}
            from="Default"
            label="To wound"
            value={unit.woundModifier}
            onChange={(v) => {
              set({ woundModifier: v });
            }}
          />
          <Check
            original={changed('woundIgnorePenalties', 'flag')}
            from="Default"
            boxed
            label="Ignore wound penalties"
            checked={unit.woundIgnorePenalties}
            onChange={(v) => {
              set({ woundIgnorePenalties: v });
            }}
          />
          <CritSelect
            original={changed('critWoundOn', 'crit')}
            from="Default"
            label="Critical wound"
            value={unit.critWoundOn}
            onChange={(v) => {
              set({ critWoundOn: v });
            }}
          />
          <Num
            original={changed('critAp', 'number')}
            from="Default"
            label="Critical AP +"
            value={unit.critAp}
            min={0}
            w={96}
            onChange={(v) => {
              set({ critAp: v ?? 0 });
            }}
          />
          <Num
            original={changed('critDamage', 'number')}
            from="Default"
            label="Critical D +"
            value={unit.critDamage}
            min={0}
            w={96}
            onChange={(v) => {
              set({ critDamage: v ?? 0 });
            }}
          />
          <Check
            original={changed('devastatingWounds', 'flag')}
            from="Default"
            boxed
            label="Devastating Wounds"
            checked={unit.devastatingWounds}
            onChange={(v) => {
              set({ devastatingWounds: v });
            }}
          />
        </Group>
      </Fieldset>
      <Fieldset
        legend="Saves and damage"
        variant="filled"
        p="sm"
        classNames={{ legend: classes.legend }}
      >
        <Group gap="xs" align="flex-end">
          <Num
            original={changed('apImprove', 'number')}
            from="Default"
            label="Improve AP by"
            value={unit.apImprove}
            min={0}
            w={96}
            onChange={(v) => {
              set({ apImprove: v ?? 0 });
            }}
          />
          <Num
            original={changed('saveModifier', 'number')}
            from="Default"
            label="Worsen saves by"
            value={unit.saveModifier}
            min={0}
            w={110}
            onChange={(v) => {
              set({ saveModifier: v ?? 0 });
            }}
          />
          <Check
            original={changed('damageReroll', 'flag')}
            from="Default"
            boxed
            label="Re-roll damage"
            checked={unit.damageReroll}
            onChange={(v) => {
              set({ damageReroll: v });
            }}
          />
          <Check
            original={changed('damageRerollOneDie', 'flag')}
            from="Default"
            boxed
            label="Re-roll one damage"
            checked={unit.damageRerollOneDie}
            onChange={(v) => {
              set({ damageRerollOneDie: v });
            }}
          />
          <Num
            original={changed('damageModifier', 'number')}
            from="Default"
            label="Damage +"
            value={unit.damageModifier}
            min={-3}
            w={80}
            onChange={(v) => {
              set({ damageModifier: v ?? 0 });
            }}
          />
          <Check
            original={changed('ignoreDamageReduction', 'flag')}
            from="Default"
            boxed
            label="Ignore damage reduction"
            checked={unit.ignoreDamageReduction}
            onChange={(v) => {
              set({ ignoreDamageReduction: v });
            }}
          />
        </Group>
      </Fieldset>
    </Stack>
  );
}
