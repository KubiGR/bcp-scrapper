import { DETACHMENT_SEPARATOR } from '@bcp/shared';
import { Box, Button, Drawer, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { plural } from '../../lib/format';
import { useDraftRange } from '../../lib/use-draft-range';
import { CellDrawer } from './CellDrawer';
import { EventSelection } from './EventSelection';
import { FactionMatrix } from './FactionMatrix';
import { MatrixControls } from './MatrixControls';
import {
  crossCellGamesQuery,
  crossDetachmentRowsQuery,
  crossMatchupsQuery,
  crossWindow,
  type CrossSearch,
} from './matchups-queries';
import type { MatrixPick } from './matrix-pick';
import { DEFAULT_MATRIX_SETTINGS, hasSideFilter, type MatrixSettings } from './matrix-view';
import { UpdatePicker } from '../updates/UpdatePicker';

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
  const [cell, setCell] = useState<MatrixPick | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);

  const matchups = useQuery(crossMatchupsQuery(search));
  const games = useQuery({
    ...crossCellGamesQuery(search, { row: cell?.row ?? '', col: cell?.col ?? '' }),
    enabled: cell !== null,
  });

  const dates = useDraftRange(window, (range) => {
    onSearchChange({ ...search, from: range.from, to: range.to });
  });

  const settings: MatrixSettings = {
    order: search.order ?? DEFAULT_MATRIX_SETTINGS.order,
    // Win rate only: game points are no longer offered.
    metric: 'winRate',
    minGames: search.minGames ?? DEFAULT_MATRIX_SETTINGS.minGames,
    dispositions: search.dispositions?.split(',').filter(Boolean) ?? [],
    detachments: search.detachments?.split(DETACHMENT_SEPARATOR).filter(Boolean) ?? [],
    side: search.side ?? DEFAULT_MATRIX_SETTINGS.side,
    factions: search.factions?.split('|').filter(Boolean) ?? [],
  };
  // A server-side filter/tick change refetches; keep showing the previous matrix (dimmed) instead
  // of blanking the view, so the event list and controls stay usable while the new data loads.
  const dimmed = matchups.isPlaceholderData || matchups.isFetching;

  const eventSelection = matchups.data && (
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
  );

  return (
    <Stack gap="lg">
      <Title order={1}>Faction matchups</Title>
      <Group gap="md" align="flex-end" wrap="wrap">
        <DatePickerInput
          type="range"
          label="Dates"
          valueFormat="D MMM YYYY"
          allowSingleDateInRange
          value={dates.draft}
          onChange={dates.onRangeChange}
          w={{ base: '100%', xs: 280 }}
        />
        <UpdatePicker
          from={window.from}
          to={window.to}
          onChange={(range) => {
            onSearchChange({ ...search, from: range.from, to: range.to });
          }}
        />
        {matchups.data && matchups.data.events.length > 0 && (
          <Button
            variant="default"
            onClick={() => {
              setEventsOpen(true);
            }}
          >
            {`Events · ${String(matchups.data.events.filter((e) => e.included).length)} of ${String(matchups.data.events.length)}`}
          </Button>
        )}
      </Group>
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
          {(() => {
            const unsynced = matchups.data.events.filter(
              (event) => event.pairings === 'missing' || event.pairings === 'partial',
            ).length;
            return unsynced > 0 ? (
              <Text size="sm" c="dimmed">
                {plural(unsynced, 'event')} {unsynced === 1 ? 'is' : 'are'} missing pairings: fetch
                them under Events.
              </Text>
            ) : null;
          })()}
          {matchups.data.events.length === 0 ? (
            eventSelection
          ) : (
            // The event list is long: it lives in a drawer, so the matrix comes first.
            <Drawer
              opened={eventsOpen}
              onClose={() => {
                setEventsOpen(false);
              }}
              position="right"
              size="xl"
              title="Events in this range"
            >
              {eventSelection}
            </Drawer>
          )}
          {matchups.data.events.length > 0 && (
            <>
              <MatrixControls
                settings={settings}
                onChange={(next) => {
                  onSearchChange({
                    ...search,
                    // Best first is the default: only A→Z goes in the address.
                    order: next.order === 'name' ? 'name' : undefined,
                    minGames: next.minGames,
                    dispositions:
                      next.dispositions.length > 0 ? next.dispositions.join(',') : undefined,
                    detachments:
                      next.detachments.length > 0
                        ? next.detachments.join(DETACHMENT_SEPARATOR)
                        : undefined,
                    side: next.side,
                    factions: next.factions.length > 0 ? next.factions.join('|') : undefined,
                  });
                }}
                dispositions={[]}
                detachments={matchups.data.detachments}
                detachmentFactions={matchups.data.detachmentFactions}
                factions={matchups.data.matrix.factions}
              />
              <Box style={{ opacity: dimmed ? 0.6 : 1 }} aria-busy={dimmed}>
                {(() => {
                  const noneIncluded = !matchups.data.events.some((event) => event.included);
                  const noGames = matchups.data.matrix.games === 0;
                  const dispositionActive = hasSideFilter(settings);
                  if (!noneIncluded && noGames && dispositionActive) {
                    return (
                      <Group gap="sm">
                        <Text size="sm" c="dimmed">
                          No games match this filter.
                        </Text>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => {
                            onSearchChange({
                              ...search,
                              dispositions: undefined,
                              detachments: undefined,
                            });
                          }}
                        >
                          Clear filter
                        </Button>
                      </Group>
                    );
                  }
                  if (noneIncluded || noGames) {
                    return (
                      <Text size="sm" c="dimmed">
                        Tick at least one event with pairings to see matchups.
                      </Text>
                    );
                  }
                  return (
                    <>
                      <Text size="sm" c="dimmed">
                        <span className="numeric">{matchups.data.matrix.games}</span> games ·{' '}
                        <span className="numeric">{matchups.data.matrix.factions.length}</span>{' '}
                        factions
                      </Text>
                      <FactionMatrix
                        matrix={matchups.data.matrix}
                        scoring={matchups.data.scoring}
                        settings={settings}
                        onCell={setCell}
                        detachments={crossDetachmentRowsQuery(search)}
                      />
                    </>
                  );
                })()}
              </Box>
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
