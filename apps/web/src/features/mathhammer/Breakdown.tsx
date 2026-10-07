import type { WeaponStep } from '@bcp/shared';
import { Stack, Table, Text } from '@mantine/core';
import type { ReactNode } from 'react';

const two = (n: number) => n.toFixed(2);

/** "1.67 crit · +1.67 sustained": the parts that aren't zero (one per line with `lines`). */
const parts = (items: [number, string][], lines = false) =>
  items
    .filter(([n]) => n > 0.005)
    .map(([n, label]) =>
      label.startsWith('+') ? `+${two(n)} ${label.slice(1)}` : `${two(n)} ${label}`,
    )
    .join(lines ? '\n' : ' · ');

function Cell({ value, detail }: { value: string; detail?: string }) {
  return (
    <Table.Td ta="right" className="numeric">
      <Stack gap={0} align="flex-end">
        <span>{value}</span>
        {detail !== undefined && detail !== '' && (
          <Text size="xs" c="dimmed" span style={{ whiteSpace: 'pre-line' }}>
            {detail}
          </Text>
        )}
      </Stack>
    </Table.Td>
  );
}

const sum = (steps: WeaponStep[], key: keyof Omit<WeaponStep, 'name' | 'unsavedExact'>) =>
  steps.reduce((total, step) => total + step[key], 0);

function StepRow({
  step,
  strong = false,
  fit = false,
}: {
  step: WeaponStep;
  strong?: boolean;
  fit?: boolean;
}) {
  return (
    <Table.Tr fw={strong ? 600 : undefined}>
      <Table.Th scope="row">{step.name}</Table.Th>
      <Cell value={two(step.attacks)} />
      <Cell
        value={two(step.hits)}
        detail={parts(
          [
            [step.critHits, 'critical hits'],
            [step.sustainedHits, '+sustained'],
            [step.lethalHits, 'lethal'],
          ],
          fit,
        )}
      />
      <Cell
        value={two(step.wounds)}
        detail={parts(
          [
            [step.critWounds, 'critical wounds'],
            [step.devastating, 'devastating'],
          ],
          fit,
        )}
      />
      <Cell value={`${step.unsavedExact ? '' : '≈'}${two(step.unsaved)}`} />
      <Cell value={two(step.damage)} />
      <Cell value={two(step.wasted)} />
      <Cell value={two(step.slain)} />
    </Table.Tr>
  );
}

/**
 * Each weapon's averages in firing order, then all of them: attacks, hits, wounds, wounds that
 * failed their save, wounds the target lost, damage lost to overkill, and models slain (each
 * weapon after the ones before it).
 */
export function Breakdown({
  steps,
  fit = false,
}: {
  steps: WeaponStep[];
  /** For a picture: the whole table, its notes one per line, instead of a scroll box. */
  fit?: boolean;
}) {
  if (steps.length === 0) return null;
  const combined: WeaponStep = {
    name: 'Combined',
    attacks: sum(steps, 'attacks'),
    hits: sum(steps, 'hits'),
    critHits: sum(steps, 'critHits'),
    sustainedHits: sum(steps, 'sustainedHits'),
    lethalHits: sum(steps, 'lethalHits'),
    wounds: sum(steps, 'wounds'),
    critWounds: sum(steps, 'critWounds'),
    devastating: sum(steps, 'devastating'),
    unsaved: sum(steps, 'unsaved'),
    unsavedExact: steps.every((step) => step.unsavedExact),
    damage: sum(steps, 'damage'),
    wasted: sum(steps, 'wasted'),
    slain: sum(steps, 'slain'),
  };
  const approximate = steps.some((step) => !step.unsavedExact);
  const wrap = (table: ReactNode) =>
    fit ? (
      table
    ) : (
      <Table.ScrollContainer minWidth={640} data-scroll>
        {table}
      </Table.ScrollContainer>
    );
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        Step by step
      </Text>
      {wrap(
        <Table aria-label="Step by step" verticalSpacing={4} fz={fit ? 'xs' : undefined}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Weapon</Table.Th>
              <Table.Th ta="right">Attacks</Table.Th>
              <Table.Th ta="right">Hits</Table.Th>
              <Table.Th ta="right">Wounds</Table.Th>
              <Table.Th ta="right">Unsaved</Table.Th>
              <Table.Th ta="right">Damage dealt</Table.Th>
              <Table.Th ta="right">Wasted</Table.Th>
              <Table.Th ta="right">Models slain</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {steps.map((step, index) => (
              <StepRow key={`${step.name}-${String(index)}`} step={step} fit={fit} />
            ))}
            {steps.length > 1 && <StepRow step={combined} strong fit={fit} />}
          </Table.Tbody>
        </Table>,
      )}
      <Text size="xs" c="dimmed">
        Averages. Critical hits are unmodified 6s to hit; critical wounds are 6s to wound, or lower
        with Anti. Damage dealt is wounds the target lost, after damage reduction, Feel No Pain and
        overkill; each weapon counts after the ones above it.
        {approximate &&
          ' ≈: the target’s models save differently, so unsaved wounds use the save of the models hit first.'}
      </Text>
    </Stack>
  );
}
