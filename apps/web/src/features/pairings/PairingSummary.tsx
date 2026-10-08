import type { PairingAnalysis, PairingRosterPlayer } from '@bcp/shared';
import { Group, Stack, Text } from '@mantine/core';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function PairingSummary({
  analysis,
  ours,
  theirs,
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
}) {
  const likely = analysis.theirDefender.indexOf(Math.max(...analysis.theirDefender));
  const mix = analysis.ourDefender
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p > 0.005)
    .sort((a, b) => b.p - a.p)
    .map((x) => `${army(ours[x.i])} ${pct(x.p)}`)
    .join(', ');
  const stat = (label: string, value: string, note?: string) => (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={600} className="numeric">
        {value}
      </Text>
      {note && (
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      )}
    </Stack>
  );
  return (
    <Group gap="xl" align="flex-start">
      {stat('Expected team score (of 100)', analysis.value.toFixed(1), '50 is even')}
      {stat(
        'Safe defender',
        army(ours[analysis.safeDefender.index]),
        `at least ${analysis.safeDefender.worst.toFixed(1)}`,
      )}
      {stat('Unpredictable defender', mix, 'pick at random with these odds')}
      {stat('Their likely defender', army(theirs[likely]))}
    </Group>
  );
}
