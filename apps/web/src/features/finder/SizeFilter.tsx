import { NumberInput, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core';
import {
  FinderSearchSchema,
  SIZE_PRESETS,
  type FinderSearch,
  type OnFinderChange,
} from './finder-search';

// Short labels, to fit the sidebar: "All (20+)" is just 20+.
const OPTIONS = [
  ...SIZE_PRESETS.map((preset) => ({
    label: preset.value === 'all' ? '20+' : preset.label,
    value: preset.value,
  })),
  { label: 'Custom', value: 'custom' },
];

interface SizeFilterProps {
  search: Pick<FinderSearch, 'size' | 'min' | 'max'>;
  onChange: OnFinderChange;
}

const countOrUndefined = (value: string | number) =>
  typeof value === 'number' ? value : undefined;

export function SizeFilter({ search, onChange }: SizeFilterProps) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Players
      </Text>
      <SegmentedControl
        aria-label="Tournament size"
        data={OPTIONS}
        fullWidth
        size="xs"
        value={search.size}
        onChange={(value) => {
          onChange({ size: FinderSearchSchema.shape.size.parse(value) });
        }}
      />
      {search.size === 'custom' && (
        <SimpleGrid cols={2} spacing="sm">
          <NumberInput
            label="Min players"
            min={0}
            value={search.min ?? ''}
            onChange={(value) => {
              onChange({ min: countOrUndefined(value) }, { replace: true });
            }}
          />
          <NumberInput
            label="Max players"
            min={0}
            value={search.max ?? ''}
            onChange={(value) => {
              onChange({ max: countOrUndefined(value) }, { replace: true });
            }}
          />
        </SimpleGrid>
      )}
    </Stack>
  );
}
