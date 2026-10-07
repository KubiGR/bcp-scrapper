import { atLeast, type Calculation, type CalculationResult } from '@bcp/shared';
import { Alert, Group, Stack, Table, Text } from '@mantine/core';
import { Panel } from '../../components/Panel';
import { Breakdown } from './Breakdown';
import { DamageChart } from './DamageChart';
import { ShareResult } from './ShareResult';
import classes from './ResultPanel.module.css';

/** 0.623 → "62%"; tiny chances never round to a flat 0% or 100%. */
export function percent(p: number): string {
  if (p > 0 && p < 0.005) return '<1%';
  if (p < 1 && p >= 0.995) return '>99%';
  return `${String(Math.round(p * 100))}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={600} className="numeric" aria-label={label}>
        {value}
      </Text>
    </Stack>
  );
}

export type Outcome =
  | {
      result: CalculationResult;
      /** What was calculated: the weapons as used (Best's profiles chosen), target, situation. */
      calculation: Calculation;
      groupNames: string[];
      /** Profile names Best chose, by weapon row key. */
      best: Record<string, string>;
    }
  | { error: string };

/** Averages, the chance of each number of models slain or more, and the allocation used. */
export function ResultPanel({
  outcome,
  attacker,
  defender,
  phase,
}: {
  outcome: Outcome;
  /** Names for the shared image. */
  attacker: string;
  defender: string;
  phase: 'shooting' | 'fighting';
}) {
  if ('error' in outcome) {
    return (
      <Panel title="Result">
        <Alert color="red" title="Can’t calculate">
          {outcome.error}
        </Alert>
      </Panel>
    );
  }
  const { result, groupNames } = outcome;
  const slain = atLeast(result.modelsSlain).slice(1);
  const order = result.orders[0];
  return (
    <Panel title="Result">
      <Stack gap="md">
        <Group justify="flex-end">
          <ShareResult
            calculation={outcome.calculation}
            result={result}
            attacker={attacker}
            defender={defender}
            phase={phase}
          />
        </Group>
        <Group gap="xl">
          <Stat label="Models slain" value={result.averages.modelsSlain.toFixed(2)} />
          <Stat label="Wounds dealt" value={result.averages.woundsDealt.toFixed(2)} />
          <Stat label="Wasted damage" value={result.averages.wasted.toFixed(2)} />
          <Stat label="Wipe" value={percent(result.wipe)} />
          {result.leaderSlain !== null && (
            <Stat label="Leader slain" value={percent(result.leaderSlain)} />
          )}
        </Group>
        <DamageChart woundsDealt={result.woundsDealt} />
        <Table aria-label="Models slain, at least" withRowBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Models slain</Table.Th>
              <Table.Th ta="right">Chance</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {slain.map((p, i) => (
              <Table.Tr key={i}>
                <Table.Td className="numeric">{`${String(i + 1)}+`}</Table.Td>
                <Table.Td ta="right" className="numeric">
                  {percent(p)}
                </Table.Td>
                <Table.Td w="60%">
                  <div className={classes.track} aria-hidden>
                    <div className={classes.bar} style={{ width: `${String(p * 100)}%` }} />
                  </div>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {order !== undefined && groupNames.length > 1 && (
          <Text size="xs" c="dimmed">
            {`Allocation: ${order.map((g) => groupNames[g] ?? '?').join(' → ')}`}
          </Text>
        )}
        <Breakdown steps={result.breakdown} />
      </Stack>
    </Panel>
  );
}
