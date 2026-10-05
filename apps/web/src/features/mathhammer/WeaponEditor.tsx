import { Button, Group, Paper, Stack, TextInput } from '@mantine/core';
import type { WeaponRow } from './form-state';
import { Check, DiceInput, Num } from './inputs';

/** One weapon: its profile on the first line, its keywords on the second. */
export function WeaponEditor({
  index,
  weapon,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  weapon: WeaponRow;
  count: number;
  onChange: (patch: Partial<WeaponRow>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const w = weapon;
  return (
    <Paper withBorder p="sm" component="fieldset" aria-label={`Weapon ${String(index + 1)}`}>
      <Stack gap="xs">
        <Group gap="xs" align="flex-end">
          <TextInput
            size="xs"
            label="Weapon"
            value={w.name}
            w={150}
            onChange={(event) => {
              onChange({ name: event.currentTarget.value });
            }}
          />
          <Num
            label="Models"
            value={w.models}
            min={0}
            onChange={(v) => {
              onChange({ models: v ?? 0 });
            }}
          />
          <DiceInput
            label="Attacks"
            value={w.attacks}
            onChange={(v) => {
              onChange({ attacks: v });
            }}
          />
          <Num
            label={w.melee ? 'WS' : 'BS'}
            value={w.skill}
            min={2}
            max={6}
            nullable
            onChange={(v) => {
              onChange({ skill: v });
            }}
          />
          <Num
            label="S"
            value={w.strength}
            min={1}
            onChange={(v) => {
              onChange({ strength: v ?? 1 });
            }}
          />
          <Num
            label="AP"
            value={w.ap}
            min={-6}
            max={0}
            onChange={(v) => {
              onChange({ ap: v ?? 0 });
            }}
          />
          <DiceInput
            label="D"
            value={w.damage}
            onChange={(v) => {
              onChange({ damage: v });
            }}
          />
          <Check
            label="Melee"
            checked={w.melee}
            onChange={(v) => {
              onChange({ melee: v });
            }}
          />
          <Group gap={4}>
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => {
                onMove(-1);
              }}
            >
              ↑
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label="Move down"
              disabled={index === count - 1}
              onClick={() => {
                onMove(1);
              }}
            >
              ↓
            </Button>
            <Button size="compact-xs" variant="subtle" color="red" onClick={onRemove}>
              Remove
            </Button>
          </Group>
        </Group>
        <Group gap="sm" align="flex-end">
          <Check
            label="Torrent"
            checked={w.torrent}
            onChange={(v) => {
              onChange({ torrent: v });
            }}
          />
          <Check
            label="Lethal Hits"
            checked={w.lethalHits}
            onChange={(v) => {
              onChange({ lethalHits: v });
            }}
          />
          <Check
            label="Devastating Wounds"
            checked={w.devastatingWounds}
            onChange={(v) => {
              onChange({ devastatingWounds: v });
            }}
          />
          <Check
            label="Twin-linked"
            checked={w.twinLinked}
            onChange={(v) => {
              onChange({ twinLinked: v });
            }}
          />
          <Check
            label="Heavy"
            checked={w.heavy}
            onChange={(v) => {
              onChange({ heavy: v });
            }}
          />
          <Check
            label="Lance"
            checked={w.lance}
            onChange={(v) => {
              onChange({ lance: v });
            }}
          />
          <Check
            label="Ignores Cover"
            checked={w.ignoresCover}
            onChange={(v) => {
              onChange({ ignoresCover: v });
            }}
          />
          <Check
            label="Precision"
            checked={w.precision}
            onChange={(v) => {
              onChange({ precision: v });
            }}
          />
          <Check
            label="Indirect Fire"
            checked={w.indirectFire}
            onChange={(v) => {
              onChange({ indirectFire: v });
            }}
          />
        </Group>
        <Group gap="xs" align="flex-end">
          <DiceInput
            label="Sustained Hits"
            value={w.sustainedHits}
            w={96}
            onChange={(v) => {
              onChange({ sustainedHits: v });
            }}
          />
          <DiceInput
            label="Rapid Fire"
            value={w.rapidFire}
            w={80}
            onChange={(v) => {
              onChange({ rapidFire: v });
            }}
          />
          <Num
            label="Blast"
            value={w.blast}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ blast: v });
            }}
          />
          <Num
            label="Cleave"
            value={w.cleave}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ cleave: v });
            }}
          />
          <Num
            label="Melta"
            value={w.melta}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ melta: v });
            }}
          />
          <TextInput
            size="xs"
            label="Anti"
            placeholder="INFANTRY 4+"
            value={w.anti}
            w={160}
            onChange={(event) => {
              onChange({ anti: event.currentTarget.value });
            }}
          />
        </Group>
      </Stack>
    </Paper>
  );
}
