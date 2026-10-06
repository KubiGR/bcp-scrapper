import { Button, Group, Paper, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { Panel } from '../../components/Panel';
import { defenderFrom, defenderFromList } from './datasheet-form';
import { newGroup, type DefenderForm, type GroupRow } from './form-state';
import { Check, CheckGrid, Num } from './inputs';
import { ListPicker } from './ListPicker';
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
  const [from, setFrom] = useState<'unit' | 'list'>('unit');
  const set = (patch: Partial<DefenderForm>) => {
    onChange({ ...defender, ...patch });
  };
  return (
    <Panel title="Defender">
      <Stack gap="md">
        <SegmentedControl
          size="xs"
          aria-label="Defender source"
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
            label="Defender"
            onPick={(sheet, size, attached) => {
              onChange(defenderFrom(sheet, size, attached, defender));
            }}
          />
        ) : (
          <ListPicker
            label="Defender"
            onPick={(list, index) => {
              onChange(defenderFromList(list, index, defender));
            }}
          />
        )}
        {defender.source !== null && (
          <Text size="xs" c="dimmed">{`From datasheet: ${defender.source}`}</Text>
        )}
        {defender.damageNote !== null && (
          <Text size="xs" c="dimmed">
            {defender.damageNote}
          </Text>
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
        <CheckGrid>
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
        </CheckGrid>
        <Num
          label="Damage -"
          value={defender.damageReduction}
          min={0}
          w={80}
          onChange={(v) => {
            set({ damageReduction: v ?? 0 });
          }}
        />
      </Stack>
    </Panel>
  );
}
