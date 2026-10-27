import { selectedUpdates, selectionRange, toIsoDate, updateOfDay } from '@bcp/shared';
import { MultiSelect, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { formatEventDates, formatIsoDay } from '../../lib/format';
import { updatesQuery, useUpdateSpans } from './updates-queries';

interface UpdatePickerProps {
  from: string;
  to: string;
  /**
   * The picked updates' days, from the first's start to the last's end; no `to` when that's the
   * current update (the page's default end is today, so saved links keep up with new events).
   */
  onChange: (range: { from: string; to: string | undefined }) => void;
}

/**
 * Game updates (MFM, Faction Packs, Dataslates, codexes) as a shortcut for the page's dates:
 * picking some sets the dates to their days, updates between them included; dates that line up
 * with updates show those updates picked. Nothing without updates.
 */
export function UpdatePicker({ from, to, onChange }: UpdatePickerProps) {
  const spans = useUpdateSpans();
  const { data: updates } = useQuery(updatesQuery);
  if (spans.length === 0) return null;
  // The factions each update touched, under its name in the list.
  const summaries = new Map(updates?.updates.map((u) => [u.id, u.summary]));
  const newest = spans.at(-1)?.id;
  // "Current": the update in force today; one whose start was moved into the future is upcoming.
  const today = toIsoDate(new Date());
  const current = updateOfDay(spans, today)?.id;
  const data = [...spans].reverse().map((span) => ({
    value: span.id,
    label:
      span.start > today
        ? `Upcoming: ${span.name}`
        : span.id === current
          ? `Current: ${span.name}`
          : span.name,
  }));
  // When each was in force, under its name: the current one since its start, an upcoming one from it.
  const dates = new Map(
    spans.map((span) => [
      span.id,
      span.start > today
        ? `From ${formatIsoDay(span.start)}`
        : span.id === current
          ? `Since ${formatIsoDay(span.from)}`
          : formatEventDates(`${span.from}T00:00:00Z`, `${span.to}T00:00:00Z`),
    ]),
  );
  const value = selectedUpdates(spans, from, to);
  return (
    <MultiSelect
      label="Update"
      data={data}
      value={value}
      placeholder={value.length === 0 ? 'Custom dates' : undefined}
      onChange={(ids) => {
        const range = selectionRange(spans, ids);
        if (range === null) return;
        onChange({ from: range.from, to: ids.includes(newest ?? '') ? undefined : range.to });
      }}
      renderOption={({ option }) => {
        const summary = summaries.get(option.value) ?? '';
        return (
          <Stack gap={0}>
            <Text size="sm">{option.label}</Text>
            <Text size="xs" c="dimmed" className="numeric">
              {dates.get(option.value)}
            </Text>
            {summary !== '' && (
              <Text size="xs" c="dimmed">
                {summary}
              </Text>
            )}
          </Stack>
        );
      }}
      w={{ base: '100%', xs: 260 }}
    />
  );
}
