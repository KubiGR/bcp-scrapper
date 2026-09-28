import { daysIn, estimateCatalogRequests, findGaps, toIsoDate, type DateRange } from '@bcp/shared';
import { Alert, Button, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { formatIsoDay } from '../../lib/format';
import { fetchCatalogGaps } from '../sync/follow-sync';
import { useSync } from '../sync/use-sync';
import { coverageQuery } from './finder-queries';

function GapsText({ gaps }: { gaps: DateRange[] }) {
  const requests = gaps.reduce((sum, gap) => sum + estimateCatalogRequests(gap), 0);
  const cost = (
    <>
      (about <span className="numeric">{requests}</span> requests)
    </>
  );
  const [only] = gaps;
  if (gaps.length === 1 && only) {
    return (
      <>
        {formatIsoDay(only.from)} – {formatIsoDay(only.to)} hasn't been fetched from BCP yet {cost}.
      </>
    );
  }
  const days = gaps.reduce((sum, gap) => sum + daysIn(gap), 0);
  return (
    <>
      <span className="numeric">{gaps.length}</span> date ranges (
      <span className="numeric">{days}</span> days) haven't been fetched from BCP yet {cost}.
    </>
  );
}

/** Tells the user when part of a deep search hasn't been fetched from BCP, and fetches it on request. */
export function CoverageNotice({ window }: { window: DateRange }) {
  const coverage = useQuery(coverageQuery);
  const sync = useSync({
    label: 'Catalogue fetch',
    invalidate: [['events'], coverageQuery.queryKey],
  });
  if (!coverage.data) return null;

  const activeRun = coverage.data.activeRun;
  // Coverage stops at the day each run finished (future days keep changing), so only days up to
  // today can ever count as fetched: gaps are looked for up to today.
  const today = toIsoDate(new Date());
  // A range wholly in the future never counts as fetched, so it's always offered as is.
  const upcoming = window.from > today;
  const gaps = upcoming
    ? [window]
    : findGaps(
        { from: window.from, to: window.to < today ? window.to : today },
        coverage.data.ranges,
      );
  const busy = sync.isSyncing || activeRun !== null;
  if (!busy && gaps.length === 0) return null;

  // While someone else's catalogue run is active, the coverage query polls it (see coverageQuery).
  const found = sync.isSyncing ? (sync.run?.done ?? 0) : (activeRun?.done ?? 0);
  return (
    <Alert
      color={busy ? 'neon' : 'yellow'}
      variant={busy ? 'light' : 'outline'}
      title={
        busy
          ? 'Fetching tournaments from BCP'
          : upcoming
            ? 'Upcoming events'
            : 'Not fetched from BCP yet'
      }
    >
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="sm" aria-live="polite">
          {!busy &&
            (upcoming ? (
              'Upcoming events change as organisers add them to BCP.'
            ) : (
              <GapsText gaps={gaps} />
            ))}
          {busy && sync.waiting && 'Waiting for the current catalogue refresh…'}
          {busy && !sync.waiting && (
            <>
              <span className="numeric">{found}</span> events so far. Results appear when it's done.
            </>
          )}
        </Text>
        <Button
          size="xs"
          loading={busy}
          disabled={gaps.length === 0}
          onClick={() => {
            sync.track((onProgress, options) => fetchCatalogGaps(gaps, onProgress, options));
          }}
        >
          Fetch
        </Button>
      </Group>
    </Alert>
  );
}
