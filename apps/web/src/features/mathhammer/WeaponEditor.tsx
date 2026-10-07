import { keywordEffect, type WeaponMods } from '@bcp/shared';
import { Badge, Button, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  keywordBoxes,
  originalText,
  resetWeapon,
  weaponChanges,
  type WeaponRow,
} from './form-state';
import { Check, CheckGrid, changedProps, DiceInput, Num } from './inputs';
import inputClasses from './inputs.module.css';
import { SwitchesEditor } from './SwitchesEditor';

/** One weapon: its profile on the first line, its keywords on the second. */
/** The Anti box's hint: the datasheet's Anti (always applied), the box being for more. */
const antiHint = (keywordNames: string[]) => {
  const anti = keywordNames.filter((name) => /^anti/i.test(name.trim()));
  return anti.length === 0
    ? 'Extra, e.g. INFANTRY 4+'
    : `Datasheet: ${anti.join(', ')}; add more here`;
};

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
        <Group justify="space-between" align="flex-end" wrap="nowrap" data-row="header">
          <TextInput
            classNames={{ input: inputClasses.field }}
            {...changedProps(originalText(w, 'name'))}
            size="xs"
            label="Weapon"
            value={w.name}
            w={{ base: 180, xs: 280 }}
            onChange={(event) => {
              onChange({ name: event.currentTarget.value });
            }}
          />
          <Button
            size="xs"
            h={30}
            color="red"
            variant="light"
            aria-label="Remove weapon"
            leftSection={<span aria-hidden>✕</span>}
            onClick={onRemove}
          >
            Remove
          </Button>
        </Group>
        {sitsOut !== null && (
          <Text size="xs" c="dimmed">
            {sitsOut}
          </Text>
        )}
        {w.option && w.models === 0 && (
          <Text size="xs" c="dimmed">
            Not taken: set Weapons to use it
          </Text>
        )}
        <Group gap="xs" align="flex-end" data-row="stats">
          <Num
            original={originalText(w, 'models')}
            label="Weapons"
            value={w.models}
            min={0}
            onChange={(v) => {
              onChange({ models: v ?? 0 });
            }}
          />
          <DiceInput
            original={originalText(w, 'attacks')}
            label="Attacks"
            disabled={picked}
            value={w.attacks}
            onChange={(v) => {
              onChange({ attacks: v });
            }}
          />
          <Num
            original={originalText(w, 'skill')}
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
            original={originalText(w, 'strength')}
            label="S"
            disabled={picked}
            value={w.strength}
            min={1}
            onChange={(v) => {
              onChange({ strength: v ?? 1 });
            }}
          />
          <Num
            original={originalText(w, 'ap')}
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
            original={originalText(w, 'damage')}
            label="D"
            disabled={picked}
            value={w.damage}
            onChange={(v) => {
              onChange({ damage: v });
            }}
          />
          <Check
            original={originalText(w, 'melee')}
            label="Melee"
            boxed
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
            {w.option && (
              <Badge size="xs" variant="light" color="blue">
                Option
              </Badge>
            )}
            {w.original === null ? (
              <Badge size="xs" variant="light" color="gray">
                Added
              </Badge>
            ) : (
              weaponChanges(w).length > 0 && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="yellow"
                  title="Put this weapon back to the datasheet’s values"
                  onClick={() => {
                    onChange(resetWeapon(w));
                  }}
                >
                  Reset
                </Button>
              )
            )}
          </Group>
        </Group>
        {w.profiles.length > 1 && (
          <Group gap="xs" align="flex-end">
            <Select
              classNames={{ input: inputClasses.field }}
              {...changedProps(originalText(w, 'profile'))}
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
                  // Best uses each profile's own keywords: the boxes start empty.
                  onChange({ profile: 'best', ...keywordBoxes([]) });
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
                  ...keywordBoxes(p.keywords),
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
            original={originalText(w, 'torrent')}
            label="Torrent"
            checked={w.torrent}
            onChange={(v) => {
              onChange({ torrent: v });
            }}
          />
          <Check
            original={originalText(w, 'lethalHits')}
            label="Lethal Hits"
            checked={w.lethalHits}
            onChange={(v) => {
              onChange({ lethalHits: v });
            }}
          />
          <Check
            original={originalText(w, 'devastatingWounds')}
            label="Devastating Wounds"
            checked={w.devastatingWounds}
            onChange={(v) => {
              onChange({ devastatingWounds: v });
            }}
          />
          <Check
            original={originalText(w, 'twinLinked')}
            label="Twin-linked"
            checked={w.twinLinked}
            onChange={(v) => {
              onChange({ twinLinked: v });
            }}
          />
          <Check
            original={originalText(w, 'heavy')}
            label="Heavy"
            checked={w.heavy}
            onChange={(v) => {
              onChange({ heavy: v });
            }}
          />
          <Check
            original={originalText(w, 'lance')}
            label="Lance"
            checked={w.lance}
            onChange={(v) => {
              onChange({ lance: v });
            }}
          />
          <Check
            original={originalText(w, 'ignoresCover')}
            label="Ignores Cover"
            checked={w.ignoresCover}
            onChange={(v) => {
              onChange({ ignoresCover: v });
            }}
          />
          <Check
            original={originalText(w, 'precision')}
            label="Precision"
            checked={w.precision}
            onChange={(v) => {
              onChange({ precision: v });
            }}
          />
          <Check
            original={originalText(w, 'indirectFire')}
            label="Indirect Fire"
            checked={w.indirectFire}
            onChange={(v) => {
              onChange({ indirectFire: v });
            }}
          />
        </CheckGrid>
        <Group gap="xs" align="flex-end">
          <DiceInput
            original={originalText(w, 'sustainedHits')}
            label="Sustained Hits"
            value={w.sustainedHits}
            w={96}
            onChange={(v) => {
              onChange({ sustainedHits: v });
            }}
          />
          <DiceInput
            original={originalText(w, 'rapidFire')}
            label="Rapid Fire"
            value={w.rapidFire}
            w={80}
            onChange={(v) => {
              onChange({ rapidFire: v });
            }}
          />
          <Num
            original={originalText(w, 'blast')}
            label="Blast"
            value={w.blast}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ blast: v });
            }}
          />
          <Num
            original={originalText(w, 'cleave')}
            label="Cleave"
            value={w.cleave}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ cleave: v });
            }}
          />
          <Num
            original={originalText(w, 'melta')}
            label="Melta"
            value={w.melta}
            min={1}
            nullable
            onChange={(v) => {
              onChange({ melta: v });
            }}
          />
          <TextInput
            classNames={{ input: inputClasses.field }}
            {...changedProps(originalText(w, 'anti'))}
            size="xs"
            label="Anti"
            placeholder={antiHint(w.keywordNames)}
            value={w.anti}
            w={w.keywordNames.some((name) => /^anti/i.test(name.trim())) ? 340 : 190}
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
