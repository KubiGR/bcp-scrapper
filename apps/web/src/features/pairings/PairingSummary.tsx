import type { PairingAnalysis, PairingRosterPlayer } from '@bcp/shared';
import { Group, Stack, Text } from '@mantine/core';
import { withRuledOut } from './ruled-out';

const army = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function PairingSummary({
  analysis,
  ours,
  theirs,
  ruledOut = new Set(),
}: {
  analysis: PairingAnalysis;
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  /** Their defenders ruled out in the grid: the picture without them. */
  ruledOut?: ReadonlySet<number>;
}) {
  const view = withRuledOut(analysis, ruledOut);
  const likely = view.theirDefender.indexOf(Math.max(...view.theirDefender));
  const without = [...ruledOut].map((e) => army(theirs[e])).join(', ');
  const mix = view.ourDefender
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
      {stat(
        'Expected team score (of 100)',
        view.value.toFixed(1),
        without ? `50 is even · without ${without}` : '50 is even',
      )}
      {stat(
        'Safe defender',
        army(ours[view.safeDefender.index]),
        `at least ${view.safeDefender.worst.toFixed(1)}`,
      )}
      {stat('Unpredictable defender', mix, 'pick at random with these odds')}
      {stat(
        'Their likely defender',
        army(theirs[likely]),
        without ? `without ${without}` : undefined,
      )}
    </Group>
  );
}
