import type { Situation } from '@bcp/shared';
import { Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { Panel } from '../../components/Panel';
import { NO_SITUATION } from './form-state';
import { Check } from './inputs';

/** The situation of the whole calculation: weapon rules apply only when theirs is ticked. */
export function SituationPanel({
  situation,
  onChange,
}: {
  situation: Situation;
  onChange: (next: Situation) => void;
}) {
  const check = (label: string, key: keyof Situation) => (
    <Check
      label={label}
      checked={situation[key]}
      boxed
      from="Default"
      original={situation[key] === NO_SITUATION[key] ? null : NO_SITUATION[key] ? 'on' : 'off'}
      onChange={(v) => {
        onChange({ ...situation, [key]: v });
      }}
    />
  );
  return (
    <Panel title="Situation">
      <Group mb="xs">
        <Button
          disabled={
            !(Object.keys(NO_SITUATION) as (keyof Situation)[]).some(
              (key) => situation[key] !== NO_SITUATION[key],
            )
          }
          size="compact-xs"
          variant="subtle"
          color="yellow"
          onClick={() => {
            onChange(NO_SITUATION);
          }}
        >
          Clear situation
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Attacker
          </Text>
          {check('Moved more than 3" (no Heavy)', 'movedOver3')}
          {check('Half range (Rapid Fire, Melta)', 'halfRange')}
          {check('Charged (Lance)', 'charged')}
          {check('Plunging fire (+1 BS)', 'plungingFire')}
          {check('Snap shooting (6s hit)', 'snapShooting')}
          {check('Indirect shooting', 'indirectShooting')}
          {check('…stayed still, target seen by a friend', 'indirectStationaryVisible')}
          {check('Damaged (-1 to hit)', 'attackerDamaged')}
        </Stack>
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            Target
          </Text>
          {check('In cover (-1 BS for ranged)', 'cover')}
          {check('Armour of Contempt (AP worse by 1)', 'armourOfContempt')}
        </Stack>
      </SimpleGrid>
    </Panel>
  );
}
