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
