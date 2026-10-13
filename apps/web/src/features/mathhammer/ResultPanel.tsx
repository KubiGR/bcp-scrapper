import { atLeast, type Calculation, type CalculationResult } from '@bcp/shared';
import { Alert, Group, Stack, Table, Text } from '@mantine/core';
import { Panel } from '../../components/Panel';
import { Breakdown } from './Breakdown';
import { DamageChart } from './DamageChart';
import { expected } from './expected';
import type { MathhammerForm } from './form-state';
import { MonteCarloCheck } from './MonteCarloCheck';
import { ShareResult } from './ShareResult';
import classes from './ResultPanel.module.css';

/** 0.623 → "62%"; tiny chances never round to a flat 0% or 100%. */
export function percent(p: number): string {
  if (p > 0 && p < 0.005) return '<1%';
  if (p < 1 && p >= 0.995) return '>99%';
  return `${String(Math.round(p * 100))}%`;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Stack gap={0} aria-label={label}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={600} className="numeric">
        {value}
      </Text>
      {note !== undefined && (
        <Text size="xs" c="dimmed" className="numeric">
          {note}
        </Text>
      )}
    </Stack>
  );
}

/** A whole-number result: the median leads (it can happen); the average and most likely below. */
export function expectedStat(dist: number[], mean: number): { value: string; note: string } {
  const e = expected(dist);
  return {
    value: String(e.median),
    note: `average ${mean.toFixed(2)} · most likely ${String(e.mode)}`,
  };
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
  form,
}: {
  outcome: Outcome;
  /** The page's form, for the shared image. */
  form: MathhammerForm;
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
  // "At least n" only falls as n grows: the totals below a 1% chance are left off the end.
  const slain = atLeast(result.modelsSlain)
    .slice(1)
    .filter((p) => p >= 0.005);
  const order = result.orders[0];
  return (
    <Panel title="Result">
      <Stack gap="md">
        <Group justify="flex-end">
          <ShareResult form={form} calculation={outcome.calculation} result={result} />
        </Group>
        <Group gap="xl" align="flex-start">
          <Stat
            label="Models slain"
            {...expectedStat(result.modelsSlain, result.averages.modelsSlain)}
          />
          <Stat
            label="Wounds dealt"
            {...expectedStat(result.woundsDealt, result.averages.woundsDealt)}
          />
          <Stat label="Wasted damage" value={result.averages.wasted.toFixed(2)} />
          <Stat label="Wipe" value={percent(result.wipe)} />
          {result.leaderSlain !== null && (
            <Stat label="Leader slain" value={percent(result.leaderSlain)} />
          )}
        </Group>
        {/* Damage dealt with models slain to its right, under it where there's no room. */}
        <div className={classes.chances}>
          <div className={classes.damage}>
            <DamageChart woundsDealt={result.woundsDealt} />
          </div>
          {slain.length > 0 && (
            <Table
              className={classes.slain}
              aria-label="Models slain, at least"
              withRowBorders={false}
              verticalSpacing={2}
              fz="xs"
            >
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
          )}
        </div>
        {order !== undefined && groupNames.length > 1 && (
          <Text size="xs" c="dimmed">
            {`Allocation: ${order.map((g) => groupNames[g] ?? '?').join(' → ')}`}
          </Text>
        )}
        <Breakdown steps={result.breakdown} />
        {/* A fresh check for each setup: the key drops the last one's rolls. */}
        <MonteCarloCheck
          key={JSON.stringify(outcome.calculation)}
          calculation={outcome.calculation}
          result={result}
        />
      </Stack>
    </Panel>
  );
}
