import type { EventDetail } from '@bcp/shared';
import { Box, Button, Group, Stack, Text } from '@mantine/core';
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
import { EVENT_MATRIX_SETTINGS, hasSideFilter, type MatrixSettings } from './matrix-view';
import { MatrixSkeleton } from '../../components/Skeletons';

/** The event's Matchups tab: controls, a one-line summary, the heatmap, and a drill-down drawer
 * on each cell. */
export function MatchupsPanel({ event }: { event: EventDetail }) {
  const [settings, setSettings] = useState<MatrixSettings>(EVENT_MATRIX_SETTINGS);
  const [cell, setCell] = useState<MatrixPick | null>(null);
  const live = event.pairings.queued > 0;

  const matchups = useQuery(eventMatchupsQuery(event.bcpId, settings, live));
  const players = useQuery(playersQuery(event.bcpId));
  const games = useQuery({
    ...eventCellGamesQuery(event.bcpId, { row: cell?.row ?? '', col: cell?.col ?? '' }, settings),
    enabled: cell !== null,
  });

  if (matchups.isPending) return <MatrixSkeleton label="Loading matchups" />;
  if (matchups.error) {
    return <ErrorState error={matchups.error} onRetry={() => void matchups.refetch()} />;
  }

  const { matrix, scoring: matrixScoring } = matchups.data;
  const dispositions = dispositionsOf(players.data?.items ?? []);
  // A server-side filter/tick change refetches; keep showing the previous matrix (dimmed) instead
  // of blanking the view, so controls stay usable while the new data loads.
  const dimmed = matchups.isPlaceholderData || matchups.isFetching;

  return (
    <Stack gap="md">
      <MatrixControls
        settings={settings}
        onChange={setSettings}
        dispositions={dispositions}
        detachments={matchups.data.detachments}
        detachmentFactions={matchups.data.detachmentFactions}
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
              settings={settings}
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
