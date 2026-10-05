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
