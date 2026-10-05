import type { WeaponMods } from '@bcp/shared';
import { Button, Group, Stack, Text } from '@mantine/core';
import { Panel } from '../../components/Panel';
import { newWeapon, type MathhammerForm, type WeaponRow } from './form-state';
import { Check, CritSelect, DiceInput, ModifierSelect, Num, RerollSelect } from './inputs';
import { WeaponEditor } from './WeaponEditor';

/** The unit's switches: they apply to all its weapons (weapon keywords add to them). */
function UnitSwitches({
  unit,
  flatMortals,
  onChange,
}: {
  unit: WeaponMods;
  flatMortals: string;
  onChange: (unit: WeaponMods, flatMortals: string) => void;
}) {
  const set = (patch: Partial<WeaponMods>) => {
    onChange({ ...unit, ...patch }, flatMortals);
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
        <DiceInput
          label="Mortal wounds"
          value={flatMortals}
          w={96}
          placeholder="D3"
          onChange={(v) => {
            onChange(unit, v);
          }}
        />
      </Group>
    </Stack>
  );
}

/** The attacking unit: weapons in the order they resolve, and the unit's switches. */
export function AttackerPanel({
  form,
  onChange,
}: {
  form: MathhammerForm;
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
        {form.weapons.map((weapon, index) => (
          <WeaponEditor
            key={weapon.key}
            index={index}
            weapon={weapon}
            count={form.weapons.length}
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
        <UnitSwitches
          unit={form.unit}
          flatMortals={form.flatMortals}
          onChange={(unit, flatMortals) => {
            onChange({ ...form, unit, flatMortals });
          }}
        />
      </Stack>
    </Panel>
  );
}
