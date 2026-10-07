import {
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useState } from 'react';
import { Panel } from '../../components/Panel';
import { defenderFrom, defenderFromList } from './datasheet-form';
import {
  defenderChanges,
  defenderOriginalText,
  groupChanges,
  groupOriginalText,
  newGroup,
  resetDefender,
  resetGroup,
  type DefenderForm,
  type GroupRow,
} from './form-state';
import { Check, CheckGrid, changedProps, Num } from './inputs';
import inputClasses from './inputs.module.css';
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
          classNames={{ input: inputClasses.field }}
          {...changedProps(groupOriginalText(g, 'name'))}
          size="xs"
          label="Models"
          value={g.name}
          w={130}
          onChange={(event) => {
            onChange({ name: event.currentTarget.value });
          }}
        />
        <Num
          original={groupOriginalText(g, 'models')}
          label="How many"
          value={g.models}
          min={1}
          onChange={(v) => {
            onChange({ models: v ?? 1 });
          }}
        />
        <Num
          original={groupOriginalText(g, 'toughness')}
          label="T"
          value={g.toughness}
          min={1}
          w={60}
          onChange={(v) => {
            onChange({ toughness: v ?? 1 });
          }}
        />
        <Num
          original={groupOriginalText(g, 'save')}
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
          original={groupOriginalText(g, 'invuln')}
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
          original={groupOriginalText(g, 'wounds')}
          label="W"
          value={g.wounds}
          min={1}
          w={60}
          onChange={(v) => {
            onChange({ wounds: v ?? 1 });
          }}
        />
        <Num
          original={groupOriginalText(g, 'fnp')}
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
          original={groupOriginalText(g, 'character')}
          label="Character"
          boxed
          checked={g.character}
          onChange={(v) => {
            onChange({ character: v });
          }}
        />
        <Button size="compact-xs" variant="subtle" color="red" onClick={onRemove}>
          Remove
        </Button>
        {g.original === null ? (
          <Badge size="xs" variant="light" color="gray">
            Added
          </Badge>
        ) : (
          groupChanges(g).length > 0 && (
            <Button
              size="compact-xs"
              variant="subtle"
              color="yellow"
              title="Put these models back to the datasheet’s values"
              onClick={() => {
                onChange(resetGroup(g));
              }}
            >
              Reset
            </Button>
          )
        )}
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
          classNames={{ input: inputClasses.field }}
          {...changedProps(defenderOriginalText(defender, 'keywords'))}
          size="xs"
          label="Keywords"
          description="For Anti-X, e.g. INFANTRY, ORKS"
          value={defender.keywords}
          onChange={(event) => {
            set({ keywords: event.currentTarget.value });
          }}
        />
        {defenderChanges(defender).length > 0 && (
          <Group>
            <Button
              size="compact-xs"
              variant="subtle"
              color="yellow"
              onClick={() => {
                onChange(resetDefender(defender));
              }}
            >
              Reset switches
            </Button>
          </Group>
        )}
        <CheckGrid>
          <Check
            original={defenderOriginalText(defender, 'attached')}
            label="Attached unit"
            checked={defender.attached}
            onChange={(v) => {
              set({ attached: v });
            }}
          />
          <Check
            original={defenderOriginalText(defender, 'stealth')}
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
            original={defenderOriginalText(defender, 'halveDamage')}
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
          original={defenderOriginalText(defender, 'damageReduction')}
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
