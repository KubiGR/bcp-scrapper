import { Group, NumberInput, SegmentedControl, Stack, Text } from '@mantine/core';
import { FinderSearchSchema, SIZE_PRESETS, type FinderSearch } from './finder-search';

const OPTIONS = [
  ...SIZE_PRESETS.map((preset) => ({ label: preset.label, value: preset.value })),
  { label: 'Custom', value: 'custom' },
];

interface SizeFilterProps {
  search: Pick<FinderSearch, 'size' | 'min' | 'max'>;
  onChange: (changes: Partial<FinderSearch>) => void;
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
        value={search.size}
        onChange={(value) => {
          onChange({ size: FinderSearchSchema.shape.size.parse(value) });
        }}
      />
      {search.size === 'custom' && (
        <Group gap="sm">
          <NumberInput
            label="Min players"
            min={0}
            w={140}
            value={search.min ?? ''}
            onChange={(value) => {
              onChange({ min: countOrUndefined(value) });
            }}
          />
          <NumberInput
            label="Max players"
            min={0}
            w={140}
            value={search.max ?? ''}
            onChange={(value) => {
              onChange({ max: countOrUndefined(value) });
            }}
          />
        </Group>
      )}
    </Stack>
  );
}
