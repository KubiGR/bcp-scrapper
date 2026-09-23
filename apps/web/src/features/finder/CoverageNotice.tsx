import { estimateCatalogRequests, findGaps, type DateRange } from '@bcp/shared';
import { Alert, Button, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { formatIsoDay } from '../../lib/format';
import { useSync } from '../sync/use-sync';
import { coverageQuery } from './finder-queries';

/** Tells the user when part of a deep search hasn't been fetched from BCP, and fetches it on request. */
export function CoverageNotice({ window }: { window: DateRange }) {
  const coverage = useQuery(coverageQuery);
  const sync = useSync({
    label: 'Catalogue fetch',
    invalidate: [['events'], coverageQuery.queryKey],
  });
  if (!coverage.data) return null;

  if (sync.isSyncing || coverage.data.activeRun) {
    const found = sync.run?.done ?? coverage.data.activeRun?.done ?? 0;
    return (
      <Alert color="neon" variant="light" title="Fetching tournaments from BCP">
        <Text size="sm">
          <span className="numeric">{found}</span> events so far. Results appear when it's done.
        </Text>
      </Alert>
    );
  }

  const gaps = findGaps(window, coverage.data.ranges);
  const first = gaps[0];
  const last = gaps.at(-1);
  if (!first || !last) return null;
  // One run covers every gap; re-fetching a covered day in between is harmless.
  const span = { from: first.from, to: last.to };

  return (
    <Alert color="yellow" variant="light" title="Not fetched from BCP yet">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="sm">
          {formatIsoDay(span.from)} – {formatIsoDay(span.to)} hasn't been fetched from BCP yet
          (about <span className="numeric">{estimateCatalogRequests(span)}</span> requests).
        </Text>
        <Button
          size="xs"
          onClick={() => {
            sync.start({ kind: 'catalog', ...span });
          }}
        >
          Fetch
        </Button>
      </Group>
    </Alert>
  );
}
