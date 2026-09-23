import type { DateRange } from '@bcp/shared';
import {
  Button,
  Collapse,
  Group,
  Input,
  SegmentedControl,
  SimpleGrid,
  Stack,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedCallback, useDisclosure } from '@mantine/hooks';
import { FinderSearchSchema, isLatestView, type FinderSearch } from './finder-search';

interface AdvancedSearchProps {
  search: FinderSearch;
  window: DateRange;
  onChange: (changes: Partial<FinderSearch>) => void;
}

const TYPE_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Singles', value: 'singles' },
  { label: 'Teams', value: 'teams' },
];
const SORT_OPTIONS = [
  { label: 'Newest', value: 'date' },
  { label: 'Biggest', value: 'players' },
];

export function AdvancedSearch({ search, window, onChange }: AdvancedSearchProps) {
  const [opened, { toggle }] = useDisclosure(!isLatestView(search));
  // Text fields write to the URL after a pause, not on every keystroke.
  const setName = useDebouncedCallback((value: string) => {
    onChange({ q: value.trim() || undefined });
  }, 300);
  const setCountry = useDebouncedCallback((value: string) => {
    onChange({ country: value.trim() || undefined });
  }, 300);

  return (
    <Stack gap="sm">
      <Group gap="sm">
        <Button variant="subtle" size="compact-sm" onClick={toggle} aria-expanded={opened}>
          {opened ? 'Hide advanced search' : 'Advanced search'}
        </Button>
        {!isLatestView(search) && (
          <Button
            variant="subtle"
            size="compact-sm"
            color="gray"
            onClick={() => {
              onChange({ from: undefined, to: undefined });
            }}
          >
            Back to latest
          </Button>
        )}
      </Group>
      <Collapse expanded={opened}>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          <DatePickerInput
            type="range"
            label="Dates"
            valueFormat="D MMM YYYY"
            allowSingleDateInRange
            value={[window.from, window.to]}
            onChange={([from, to]) => {
              if (from && to) onChange({ from, to });
            }}
          />
          <TextInput
            label="Name"
            placeholder="e.g. Open, GT, Teams"
            defaultValue={search.q ?? ''}
            onChange={(e) => {
              setName(e.currentTarget.value);
            }}
          />
          <TextInput
            label="Country"
            placeholder="e.g. Germany"
            defaultValue={search.country ?? ''}
            onChange={(e) => {
              setCountry(e.currentTarget.value);
            }}
          />
          <Input.Wrapper label="Type">
            <SegmentedControl
              fullWidth
              data={TYPE_OPTIONS}
              value={search.type}
              onChange={(value) => {
                onChange({ type: FinderSearchSchema.shape.type.parse(value) });
              }}
            />
          </Input.Wrapper>
          <Input.Wrapper label="Sort">
            <SegmentedControl
              fullWidth
              data={SORT_OPTIONS}
              value={search.sort}
              onChange={(value) => {
                onChange({ sort: FinderSearchSchema.shape.sort.parse(value) });
              }}
            />
          </Input.Wrapper>
        </SimpleGrid>
      </Collapse>
    </Stack>
  );
}
