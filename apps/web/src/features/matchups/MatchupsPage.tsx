import type { DateRange } from '@bcp/shared';
import { Skeleton, Stack, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { plural } from '../../lib/format';
import { CellDrawer } from './CellDrawer';
import { EventSelection } from './EventSelection';
import { FactionMatrix } from './FactionMatrix';
import { MatrixControls } from './MatrixControls';
import {
  crossCellGamesQuery,
  crossMatchupsQuery,
  crossWindow,
  type CrossSearch,
} from './matchups-queries';
import { DEFAULT_MATRIX_SETTINGS, type MatrixSettings } from './matrix-view';

type DraftRange = [string | null, string | null];

/**
 * The date picker's value, mirroring `AdvancedSearch`'s draft-range pattern: a range is picked in
 * two clicks, and the half-picked range has to live here since the URL only takes complete ranges.
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

const splitIds = (value: string | undefined): string[] =>
  value === undefined ? [] : value.split(',').filter(Boolean);

const joinIds = (ids: string[]): string | undefined =>
  ids.length === 0 ? undefined : ids.join(',');

interface MatchupsPageProps {
  search: CrossSearch;
  onSearchChange: (next: CrossSearch) => void;
}

/** The cross-event matchups page: a date range, the events in it with tick boxes and a bulk sync
 * button, and the combined heatmap with the same controls and drill-down as an event's Matchups
 * tab. */
export function MatchupsPage({ search, onSearchChange }: MatchupsPageProps) {
  const now = new Date();
  const window = crossWindow(search, now);
  const [cell, setCell] = useState<{ row: string; col: string } | null>(null);

  const matchups = useQuery(crossMatchupsQuery(search));
  const games = useQuery({
    ...crossCellGamesQuery(search, cell ?? { row: '', col: '' }),
    enabled: cell !== null,
  });

  const dates = useDraftRange(window, (range) => {
    onSearchChange({ ...search, from: range.from, to: range.to });
  });

  const settings: MatrixSettings = {
    metric: search.metric ?? DEFAULT_MATRIX_SETTINGS.metric,
    minGames: search.minGames ?? DEFAULT_MATRIX_SETTINGS.minGames,
    disposition: search.disposition ?? null,
    side: search.side ?? DEFAULT_MATRIX_SETTINGS.side,
  };

  return (
    <Stack gap="lg">
      <Title order={1}>Faction matchups</Title>
      <DatePickerInput
        type="range"
        label="Dates"
        valueFormat="D MMM YYYY"
        allowSingleDateInRange
        value={dates.draft}
        onChange={dates.onRangeChange}
        w={280}
      />
      {matchups.isPending && <Skeleton height={160} />}
      {matchups.error && (
        <ErrorState error={matchups.error} onRetry={() => void matchups.refetch()} />
      )}
      {matchups.data && (
        <>
          {matchups.data.events.some((event) => event.pairings === 'fetching') && (
            <Text size="sm" c="dimmed" aria-live="polite">
              Fetching pairings for{' '}
              <span className="numeric">
                {matchups.data.events.filter((event) => event.pairings === 'fetching').length}
              </span>{' '}
              {plural(
                matchups.data.events.filter((event) => event.pairings === 'fetching').length,
                'event',
              )}
              …
            </Text>
          )}
          <EventSelection
            events={matchups.data.events}
            exclude={splitIds(search.exclude)}
            include={splitIds(search.include)}
            onChange={(next) => {
              onSearchChange({
                ...search,
                exclude: joinIds(next.exclude),
                include: joinIds(next.include),
              });
            }}
          />
          {matchups.data.events.length > 0 && (
            <>
              <MatrixControls
                settings={settings}
                onChange={(next) => {
                  onSearchChange({
                    ...search,
                    metric: next.metric,
                    minGames: next.minGames,
                    disposition: next.disposition ?? undefined,
                    side: next.side,
                  });
                }}
                scoring={matchups.data.scoring}
                dispositions={[]}
              />
              {!matchups.data.events.some((event) => event.included) ||
              matchups.data.matrix.games === 0 ? (
                <Text size="sm" c="dimmed">
                  Tick at least one event with pairings to see matchups.
                </Text>
              ) : (
                <>
                  <Text size="sm" c="dimmed">
                    <span className="numeric">{matchups.data.matrix.games}</span> games ·{' '}
                    <span className="numeric">{matchups.data.matrix.factions.length}</span> factions
                  </Text>
                  <FactionMatrix
                    matrix={matchups.data.matrix}
                    scoring={matchups.data.scoring}
                    settings={settings}
                    onCell={setCell}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
      <CellDrawer
        cell={cell}
        games={games.data?.games}
        loading={cell !== null && games.isPending}
        error={games.error}
        onClose={() => {
          setCell(null);
        }}
      />
    </Stack>
  );
}
