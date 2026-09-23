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
import { useState } from 'react';
import {
  FinderSearchSchema,
  isLatestView,
  type FinderSearch,
  type OnFinderChange,
} from './finder-search';

interface AdvancedSearchProps {
  search: FinderSearch;
  window: DateRange;
  onChange: OnFinderChange;
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

const toParam = (text: string) => text.trim() || undefined;

/**
 * A text field bound to a URL param: typing shows at once and writes to the URL after a pause
 * (replacing the history entry); when the URL changes elsewhere (back, "Back to latest"), the
 * text follows it.
 */
function useUrlText(param: string | undefined, write: (value: string | undefined) => void) {
  const [text, setText] = useState(param ?? '');
  const [seen, setSeen] = useState(param);
  const writeLater = useDebouncedCallback(write, 300);
  if (param !== seen) {
    setSeen(param);
    // Our own write comes back as the trimmed text: keep what is being typed.
    if (toParam(text) !== param) setText(param ?? '');
  }
  const onTextChange = (value: string) => {
    setText(value);
    writeLater(toParam(value));
  };
  return { text, onTextChange, cancel: writeLater.cancel };
}

type DraftRange = [string | null, string | null];

/**
 * The date picker's value. A range is picked in two clicks, and the half-picked range has to live
 * here: the URL only takes complete ranges, so binding the picker to it would undo the first click.
 * When the URL's range changes elsewhere (back, "Back to latest"), the picker follows it.
 */
function useDraftRange(window: DateRange, write: (range: DateRange) => void) {
  const [draft, setDraft] = useState<DraftRange>([window.from, window.to]);
  const [seen, setSeen] = useState(window);
  if (window.from !== seen.from || window.to !== seen.to) {
    setSeen(window);
    setDraft([window.from, window.to]);
  }
  const onRangeChange = ([from, to]: DraftRange) => {
    setDraft([from, to]);
    if (from && to) write({ from, to });
  };
  return { draft, onRangeChange };
}

export function AdvancedSearch({ search, window, onChange }: AdvancedSearchProps) {
  const [opened, { toggle }] = useDisclosure(!isLatestView(search));
  const name = useUrlText(search.q, (q) => {
    onChange({ q }, { replace: true });
  });
  const country = useUrlText(search.country, (value) => {
    onChange({ country: value }, { replace: true });
  });
  const dates = useDraftRange(window, (range) => {
    onChange(range);
  });

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
              name.cancel();
              country.cancel();
              onChange({ from: undefined, to: undefined, q: undefined, country: undefined });
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
            value={dates.draft}
            onChange={dates.onRangeChange}
          />
          <TextInput
            label="Name"
            placeholder="e.g. Open, GT, Teams"
            value={name.text}
            onChange={(e) => {
              name.onTextChange(e.currentTarget.value);
            }}
          />
          <TextInput
            label="Country"
            placeholder="e.g. Germany"
            value={country.text}
            onChange={(e) => {
              country.onTextChange(e.currentTarget.value);
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
