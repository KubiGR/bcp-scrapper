import { Button, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { Panel } from '../../components/Panel';
import { attackerRows, attackerRowsFromList } from './datasheet-form';
import {
  newWeapon,
  sitsOut,
  targetKeywordsOf,
  type MathhammerForm,
  type WeaponRow,
} from './form-state';
import { DiceInput } from './inputs';
import { ListPicker } from './ListPicker';
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
  const [from, setFrom] = useState<'unit' | 'list'>('unit');
  // Weapons that sit out stay hidden behind one line per reason, unless asked for.
  const [showIdle, setShowIdle] = useState(false);
  const idle = new Map<string, string[]>();
  for (const weapon of form.weapons) {
    const why = sitsOut(form, weapon);
    if (why !== null) idle.set(why, [...(idle.get(why) ?? []), weapon.name || 'Unnamed weapon']);
  }
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
        ) : (
          <ListPicker
            label="Attacker"
            onPick={(list, index) => {
              const attached = list.units.filter((u) => u.attachedTo === index).map((u) => u.name);
              onChange({
                ...form,
                source: [list.units[index]?.name ?? '', ...attached].join(' + '),
                weapons: attackerRowsFromList(list, index),
              });
            }}
          />
        )}
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
        {idle.size > 0 && (
          <Group gap="xs" align="center">
            <Stack gap={0}>
              {[...idle].map(([why, names]) => (
                <Text key={why} size="xs" c="dimmed">{`${why}: ${names.join(', ')}`}</Text>
              ))}
            </Stack>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => {
                setShowIdle(!showIdle);
              }}
            >
              {showIdle ? 'Hide' : 'Show'}
            </Button>
          </Group>
        )}
        {form.weapons.map((weapon, index) =>
          !showIdle && sitsOut(form, weapon) !== null ? null : (
            <WeaponEditor
              key={weapon.key}
              index={index}
              weapon={weapon}
              count={form.weapons.length}
              unit={form.unit}
              bestName={best[weapon.key] ?? null}
              sitsOut={sitsOut(form, weapon)}
              targetKeywords={targetKeywordsOf(form.defender)}
              onChange={(patch) => {
                setWeapons(
                  form.weapons.map((w) => (w.key === weapon.key ? { ...w, ...patch } : w)),
                );
              }}
              onMove={(by) => {
                move(index, by);
              }}
              onRemove={() => {
                setWeapons(form.weapons.filter((w) => w.key !== weapon.key));
              }}
            />
          ),
        )}
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
