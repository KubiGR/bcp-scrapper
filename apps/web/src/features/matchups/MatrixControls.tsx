import {
  Group,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { DispositionText } from '../../components/DispositionText';
import { hasSideFilter, type MatrixSettings } from './matrix-view';

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
  /** Detachments played in the loaded games (from the API). */
  detachments?: string[];
  /** The matrix's factions, to show only some as rows. */
  factions?: string[];
}

export function MatrixControls({
  settings,
  onChange,
  scoring,
  dispositions,
  detachments = [],
  factions = [],
}: MatrixControlsProps) {
  const factionOptions = [...new Set([...factions, ...settings.factions])].sort((a, b) =>
    a.localeCompare(b),
  );
  const detachmentOptions = [...new Set([...detachments, ...settings.detachments])].sort((a, b) =>
    a.localeCompare(b),
  );
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
        <SegmentedControl
          aria-label="Order"
          value={settings.order}
          onChange={(value) => {
            onChange({ ...settings, order: value === 'name' ? 'name' : 'overall' });
          }}
          data={[
            { label: 'Best first', value: 'overall' },
            { label: 'A→Z', value: 'name' },
          ]}
        />
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
        <MultiSelect
          label="Factions"
          placeholder={settings.factions.length === 0 ? 'All factions' : undefined}
          clearable
          searchable
          w={{ base: '100%', xs: 260 }}
          data={factionOptions}
          value={settings.factions}
          onChange={(value) => {
            onChange({ ...settings, factions: value });
          }}
        />
        <MultiSelect
          label="Disposition"
          placeholder={settings.dispositions.length === 0 ? 'All dispositions' : undefined}
          clearable
          w={{ base: '100%', xs: 260 }}
          data={dispositionOptions}
          value={settings.dispositions}
          onChange={(value) => {
            onChange({ ...settings, dispositions: value });
          }}
          renderOption={({ option }) => <DispositionText disposition={option.value} />}
        />
        <MultiSelect
          label="Detachment"
          placeholder={settings.detachments.length === 0 ? 'All detachments' : undefined}
          clearable
          searchable
          w={{ base: '100%', xs: 260 }}
          data={detachmentOptions}
          value={settings.detachments}
          onChange={(value) => {
            onChange({ ...settings, detachments: value });
          }}
        />
        {hasSideFilter(settings) && (
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
