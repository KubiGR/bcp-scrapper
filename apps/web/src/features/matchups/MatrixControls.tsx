import { Group, NumberInput, SegmentedControl, Select, Stack, Text, Tooltip } from '@mantine/core';
import { DispositionText } from '../../components/DispositionText';
import type { MatrixSettings } from './matrix-view';

/** BCP's five known dispositions (subFactions), shown even when the loaded event has no games in
 * them yet. Anything else the data brings is appended. */
const KNOWN_DISPOSITIONS = [
  'Take and Hold',
  'Priority Assets',
  'Purge the Foe',
  'Reconnaissance',
  'Disruption',
];

interface MatrixControlsProps {
  settings: MatrixSettings;
  onChange: (settings: MatrixSettings) => void;
  scoring: { consistent: boolean; scale: number | null };
  dispositions: string[];
}

export function MatrixControls({ settings, onChange, scoring, dispositions }: MatrixControlsProps) {
  const dispositionOptions = [...new Set([...KNOWN_DISPOSITIONS, ...dispositions])];
  const pointsDisabled = !scoring.consistent || scoring.scale === null;
  const pointsReason = !scoring.consistent
    ? 'Events use different scoring'
    : 'No game points recorded';

  return (
    <Stack gap="sm">
      <Group gap="md" wrap="wrap" align="flex-end">
        <Tooltip label={pointsReason} disabled={!pointsDisabled}>
          <SegmentedControl
            aria-label="Metric"
            value={settings.metric}
            onChange={(value) => {
              onChange({ ...settings, metric: value });
            }}
            data={[
              { label: 'Win rate', value: 'winRate' },
              { label: 'Game points', value: 'points', disabled: pointsDisabled },
            ]}
          />
        </Tooltip>
        <NumberInput
          label="Min games"
          value={settings.minGames}
          min={1}
          max={50}
          w={110}
          onChange={(value) => {
            if (typeof value === 'number') onChange({ ...settings, minGames: value });
          }}
        />
        <Select
          label="Disposition"
          placeholder="All dispositions"
          clearable
          w={220}
          data={dispositionOptions}
          value={settings.disposition}
          onChange={(value) => {
            onChange({ ...settings, disposition: value });
          }}
          renderOption={({ option }) => <DispositionText disposition={option.value} />}
        />
        {settings.disposition !== null && (
          <SegmentedControl
            aria-label="Side"
            value={settings.side}
            onChange={(value) => {
              onChange({ ...settings, side: value });
            }}
            data={[
              { label: 'Row side', value: 'row' },
              { label: 'Both sides', value: 'both' },
            ]}
          />
        )}
      </Group>
      {pointsDisabled && (
        <Text size="xs" c="dimmed">
          {pointsReason}
        </Text>
      )}
    </Stack>
  );
}
