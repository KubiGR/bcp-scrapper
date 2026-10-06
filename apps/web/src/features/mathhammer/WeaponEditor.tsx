import { keywordEffect, type WeaponMods } from '@bcp/shared';
import { Button, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import type { WeaponRow } from './form-state';
import { Check, CheckGrid, DiceInput, Num } from './inputs';
import { SwitchesEditor } from './SwitchesEditor';

/** One weapon: its profile on the first line, its keywords on the second. */
export function WeaponEditor({
  index,
  weapon,
  count,
  unit,
  bestName,
  sitsOut,
  targetKeywords,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  weapon: WeaponRow;
  count: number;
  /** The unit's switches, the starting point for the weapon's own. */
  unit: WeaponMods;
  /** The profile Best chose, when the weapon is set to Best. */
  bestName: string | null;
  /** Why the weapon doesn't attack in this phase; null when it does. */
  sitsOut: string | null;
  /** The defender's keywords, to say which datasheet keywords apply. */
  targetKeywords: string[];
  onChange: (patch: Partial<WeaponRow>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const w = weapon;
  // With Best, the profile is chosen for the target: its values aren't typed.
  const picked = w.profile === 'best';
  return (
    <Paper
      withBorder
      p="sm"
      component="fieldset"
      aria-label={`Weapon ${String(index + 1)}`}
      opacity={sitsOut === null ? 1 : 0.6}
    >
      <Stack gap="xs">
        {sitsOut !== null && (
          <Text size="xs" c="dimmed">
            {sitsOut}
          </Text>
        )}
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
            disabled={picked}
            value={w.attacks}
            onChange={(v) => {
              onChange({ attacks: v });
            }}
          />
          <Num
            label={w.melee ? 'WS' : 'BS'}
            disabled={picked}
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
            disabled={picked}
            value={w.strength}
            min={1}
            onChange={(v) => {
              onChange({ strength: v ?? 1 });
            }}
          />
          <Num
            label="AP"
            disabled={picked}
            value={w.ap}
            min={-6}
            max={0}
            onChange={(v) => {
              onChange({ ap: v ?? 0 });
            }}
          />
          <DiceInput
            label="D"
            disabled={picked}
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
        {w.profiles.length > 1 && (
          <Group gap="xs" align="flex-end">
            <Select
              size="xs"
              label="Profile"
              w={200}
              allowDeselect={false}
              data={[
                { value: 'best', label: 'Best' },
                ...w.profiles.map((p, i) => ({ value: String(i), label: p.name })),
              ]}
              value={String(w.profile)}
              onChange={(next) => {
                if (next === 'best' || next === null) {
                  onChange({ profile: 'best' });
                  return;
                }
                const i = Number(next);
                const p = w.profiles[i];
                if (p === undefined) return;
                onChange({
                  profile: i,
                  melee: p.melee,
                  attacks: p.attacks,
                  skill: p.skill,
                  strength: p.strength ?? w.strength,
                  ap: p.ap,
                  damage: p.damage,
                  keywordNames: p.keywords,
                });
              }}
            />
            {picked && bestName !== null && (
              <Text size="xs" c="dimmed">{`Best here: ${bestName}`}</Text>
            )}
          </Group>
        )}
        {w.profiles.length > 0 && w.keywordNames.length > 0 && !picked && (
          <Text size="xs" c="dimmed">{`From datasheet: ${w.keywordNames
            .map((name) => {
              const effect = keywordEffect(name, targetKeywords);
              return effect === 'applies'
                ? `${name} ✓`
                : effect === 'not here'
                  ? `${name} (not this target)`
                  : name;
            })
            .join(', ')}`}</Text>
        )}
        <CheckGrid>
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
        </CheckGrid>
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
            placeholder="Extra, e.g. INFANTRY 4+"
            value={w.anti}
            w={190}
            onChange={(event) => {
              onChange({ anti: event.currentTarget.value });
            }}
          />
        </Group>
        <Check
          label="Own switches"
          checked={w.own !== null}
          onChange={(on) => {
            onChange({ own: on ? { ...unit } : null });
          }}
        />
        {w.own !== null && (
          <SwitchesEditor
            mods={w.own}
            onChange={(own) => {
              onChange({ own });
            }}
          />
        )}
      </Stack>
    </Paper>
  );
}
