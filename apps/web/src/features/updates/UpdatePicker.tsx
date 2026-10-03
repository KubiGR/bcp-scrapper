import { selectedUpdates, selectionRange } from '@bcp/shared';
import { MultiSelect } from '@mantine/core';
import { useUpdateSpans } from './updates-queries';

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
  if (spans.length === 0) return null;
  const newest = spans.at(-1)?.id;
  const data = [...spans].reverse().map((span) => ({
    value: span.id,
    label: span.id === newest ? `Current: ${span.name}` : span.name,
  }));
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
      w={{ base: '100%', xs: 260 }}
    />
  );
}
