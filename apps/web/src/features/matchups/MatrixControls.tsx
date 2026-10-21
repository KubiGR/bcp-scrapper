import { Group, MultiSelect, NumberInput, SegmentedControl, Stack } from '@mantine/core';
import { DispositionText } from '../../components/DispositionText';
import { hasSideFilter, type MatrixSettings } from './matrix-view';
import { renderFactionOption, renderFactionPill } from '../../components/FactionIcon';

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
  dispositions: string[];
  /** Detachments played in the loaded games (from the API). */
  detachments?: string[];
  /** The factions that played each detachment, so the offer follows the chosen factions. */
  detachmentFactions?: Record<string, string[]>;
  /** The matrix's factions, to show only some as rows. */
  factions?: string[];
}

export function MatrixControls({
  settings,
  onChange,
  dispositions,
  detachments = [],
  detachmentFactions = {},
  factions = [],
}: MatrixControlsProps) {
  const factionOptions = [...new Set([...factions, ...settings.factions])].sort((a, b) =>
    a.localeCompare(b),
  );
  // The chosen factions' detachments (all when none is chosen); picked ones stay offered.
  const ofChosen = (name: string) =>
    settings.factions.length === 0 ||
    (detachmentFactions[name] ?? []).some((faction) => settings.factions.includes(faction));
  const detachmentOptions = [
    ...new Set([...detachments.filter(ofChosen), ...settings.detachments]),
  ].sort((a, b) => a.localeCompare(b));
  const dispositionOptions = [...new Set([...KNOWN_DISPOSITIONS, ...dispositions])];

  return (
    <Stack gap="sm">
      <Group gap="md" wrap="wrap" align="flex-end">
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
          renderOption={renderFactionOption}
          renderPill={renderFactionPill}
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
    </Stack>
  );
}
