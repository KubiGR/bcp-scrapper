import type { DateRange } from '@bcp/shared';
import { useState } from 'react';

type DraftRange = [string | null, string | null];

/**
 * A date-range picker's value: a range is picked in two clicks, and the half-picked range has to
 * live here since the URL only takes complete ranges. `write` gets each complete range.
 */
export function useDraftRange(window: DateRange, write: (range: DateRange) => void) {
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
