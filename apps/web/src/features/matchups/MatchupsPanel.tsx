import type { EventDetail } from '@bcp/shared';
import { Box, Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { playersQuery } from '../event/event-queries';
import { dispositionsOf } from '../event/players-filter';
import { CellDrawer } from './CellDrawer';
import { FactionMatrix } from './FactionMatrix';
import { MatrixControls } from './MatrixControls';
import {
  eventCellGamesQuery,
  eventDetachmentRowsQuery,
  eventMatchupsQuery,
} from './matchups-queries';
import type { MatrixPick } from './matrix-pick';
import { DEFAULT_MATRIX_SETTINGS, hasSideFilter, type MatrixSettings } from './matrix-view';

/** The event's Matchups tab: controls, a one-line summary, the heatmap, and a drill-down drawer
 * on each cell. Falls back to win rate if the chosen metric is points but scoring turns out
 * inconsistent (e.g. after adding events with a different scale). */
export function MatchupsPanel({ event }: { event: EventDetail }) {
  const [settings, setSettings] = useState<MatrixSettings>(DEFAULT_MATRIX_SETTINGS);
  const [cell, setCell] = useState<MatrixPick | null>(null);
  const live = event.pairings.queued > 0;

  const matchups = useQuery(eventMatchupsQuery(event.bcpId, settings, live));
  const players = useQuery(playersQuery(event.bcpId));
  const games = useQuery({
    ...eventCellGamesQuery(event.bcpId, { row: cell?.row ?? '', col: cell?.col ?? '' }, settings),
    enabled: cell !== null,
  });

  if (matchups.isPending) return <Skeleton height={200} />;
  if (matchups.error) {
    return <ErrorState error={matchups.error} onRetry={() => void matchups.refetch()} />;
  }

  const { matrix, scoring: matrixScoring } = matchups.data;
  const dispositions = dispositionsOf(players.data?.items ?? []);
  // Points may have become unavailable (e.g. after adding an event with a different scale):
  // fall back to win rate rather than showing a disabled metric as selected.
  const pointsUnavailable = !matrixScoring.consistent || matrixScoring.scale === null;
  const effectiveSettings: MatrixSettings =
    settings.metric === 'points' && pointsUnavailable
      ? { ...settings, metric: 'winRate' }
      : settings;
  // A server-side filter/tick change refetches; keep showing the previous matrix (dimmed) instead
  // of blanking the view, so controls stay usable while the new data loads.
  const dimmed = matchups.isPlaceholderData || matchups.isFetching;

  return (
    <Stack gap="md">
      <MatrixControls
        settings={effectiveSettings}
        onChange={setSettings}
        scoring={matrixScoring}
        dispositions={dispositions}
        detachments={matchups.data.detachments}
        factions={matrix.factions}
      />
      <Box style={{ opacity: dimmed ? 0.6 : 1 }} aria-busy={dimmed}>
        {matrix.games === 0 ? (
          hasSideFilter(settings) ? (
            <Group gap="sm">
              <Text size="sm" c="dimmed">
                No games match this filter.
              </Text>
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  setSettings({ ...settings, dispositions: [], detachments: [] });
                }}
              >
                Clear filter
              </Button>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              No games with known factions yet.
            </Text>
          )
        ) : (
          <>
            <Text size="sm" c="dimmed">
              <span className="numeric">{matrix.games}</span> games ·{' '}
              <span className="numeric">{matrix.factions.length}</span> factions
            </Text>
            <FactionMatrix
              matrix={matrix}
              scoring={matrixScoring}
              settings={effectiveSettings}
              onCell={setCell}
              detachments={eventDetachmentRowsQuery(event.bcpId, settings)}
            />
          </>
        )}
      </Box>
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
