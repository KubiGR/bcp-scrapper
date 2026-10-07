import type { Calculation, CalculationResult } from '@bcp/shared';
import { Alert, Button, Group, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { compareRows, runMonteCarlo, type MonteCarlo } from './monte-carlo';

/**
 * A check on the exact result: rolls the same setup die by die, game after game, and sets the
 * numbers side by side. They should differ only by the rolls' noise.
 */
export function MonteCarloCheck({
  calculation,
  result,
  games = 100_000,
}: {
  calculation: Calculation;
  result: CalculationResult;
  games?: number;
}) {
  const [sim, setSim] = useState<MonteCarlo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const models = calculation.defender.groups.reduce((sum, g) => sum + g.models, 0);
  const run = () => {
    setBusy(true);
    setError(null);
    runMonteCarlo(calculation, result.orders, games)
      .then(setSim)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const rows = sim === null ? [] : compareRows(result, sim, models);
  return (
    <Stack gap={4}>
      <Group gap="sm">
        <Button size="compact-xs" variant="light" loading={busy} onClick={run}>
          {sim === null ? 'Check with Monte Carlo' : 'Roll again'}
        </Button>
        {sim !== null && (
          <Text size="xs" c="dimmed">
            {`${sim.games.toLocaleString('en')} games rolled die by die`}
          </Text>
        )}
      </Group>
      {error !== null && <Alert color="red">{`Couldn’t roll the games: ${error}`}</Alert>}
      {sim !== null && (
        <Table aria-label="Monte Carlo check" verticalSpacing={2} fz="xs" maw={560}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th ta="right">Exact</Table.Th>
              <Table.Th ta="right">Monte Carlo</Table.Th>
              <Table.Th ta="right">Diff</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.label}>
                <Table.Th scope="row" fw={500}>
                  {r.label}
                </Table.Th>
                <Table.Td ta="right" className="numeric">
                  {r.exact}
                </Table.Td>
                <Table.Td ta="right" className="numeric">
                  {r.simulated}
                </Table.Td>
                <Table.Td ta="right" className="numeric">
                  {r.diff}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
