import {
  Box,
  Group,
  NumberInput,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { plural } from '../../lib/format';
import { useDraftRange } from '../../lib/use-draft-range';
import { FactionTable, type PlayersFilter } from './FactionTable';
import { DEFAULT_MIN_PLAYERS, metaQuery, metaWindow, type MetaSearch } from './meta-queries';
import { MetaPlayersDrawer } from './MetaPlayersDrawer';
import { TeamMeta } from './TeamMeta';

interface MetaPageProps {
  search: MetaSearch;
  onSearchChange: (next: MetaSearch) => void;
}

const EVENT_TYPES = [
  { label: 'All', value: 'all' },
  { label: 'Singles', value: 'singles' },
  { label: 'Teams', value: 'teams' },
];

/** Popular factions and archetypes, how they do, and what top teams bring. */
export function MetaPage({ search, onSearchChange }: MetaPageProps) {
  const meta = useQuery(metaQuery(search));
  const [players, setPlayers] = useState<PlayersFilter | null>(null);
  const dates = useDraftRange(metaWindow(search, new Date()), (range) => {
    onSearchChange({ ...search, from: range.from, to: range.to });
  });
  const minPlayers = search.minPlayers ?? DEFAULT_MIN_PLAYERS;
  const expanded = search.expanded?.split('|').filter(Boolean) ?? [];
  const notLoaded = meta.data ? meta.data.eventsInRange - meta.data.eventsLoaded : 0;

  return (
    <Stack gap="lg">
      <Title order={1}>Meta</Title>
      <Group gap="md" align="flex-end" wrap="wrap">
        <DatePickerInput
          type="range"
          label="Dates"
          valueFormat="D MMM YYYY"
          allowSingleDateInRange
          value={dates.draft}
          onChange={dates.onRangeChange}
          w={280}
        />
        <SegmentedControl
          aria-label="Event type"
          data={EVENT_TYPES}
          value={search.type ?? 'all'}
          onChange={(value) => {
            onSearchChange({
              ...search,
              type: value === 'singles' || value === 'teams' ? value : undefined,
            });
          }}
        />
        <NumberInput
          label="Min players"
          min={1}
          max={50}
          w={110}
          value={minPlayers}
          onChange={(value) => {
            // Only whole numbers 1–50: a half-typed 0 would otherwise reset to the default.
            if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 50) {
              onSearchChange({ ...search, minPlayers: value });
            }
          }}
        />
      </Group>

      {meta.isPending && <Skeleton height={240} />}
      {meta.error && <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />}
      {meta.data && (
        <Box style={{ opacity: meta.isPlaceholderData ? 0.6 : 1 }} aria-busy={meta.isFetching}>
          <Stack gap="lg">
            {notLoaded > 0 && (
              <Text size="sm" c="dimmed">
                {plural(notLoaded, 'big event')} in this range{' '}
                {notLoaded === 1 ? 'isn’t' : 'aren’t'} loaded yet, so their players aren’t counted.
              </Text>
            )}
            {meta.data.eventsInRange === 0 ? (
              <Text size="sm" c="dimmed">
                No big events in this range.
              </Text>
            ) : meta.data.factions.length === 0 ? (
              <Text size="sm" c="dimmed">
                No players with games yet.
              </Text>
            ) : (
              <Panel
                title={`${plural(meta.data.totals.players, 'player')} · ${plural(meta.data.totals.games, 'game')}`}
              >
                <FactionTable
                  rows={meta.data.factions}
                  minPlayers={minPlayers}
                  sort={search.sort ?? 'players'}
                  expanded={expanded}
                  onSortChange={(sort) => {
                    onSearchChange({ ...search, sort });
                  }}
                  onToggle={(key) => {
                    const next = expanded.includes(key)
                      ? expanded.filter((k) => k !== key)
                      : [...expanded, key];
                    onSearchChange({
                      ...search,
                      expanded: next.length > 0 ? next.join('|') : undefined,
                    });
                  }}
                  onOpenPlayers={setPlayers}
                />
              </Panel>
            )}
            {meta.data.teams !== null && (
              <Panel title="What top teams bring">
                <TeamMeta
                  rows={meta.data.teams}
                  eventsCounted={meta.data.teamEventsCounted}
                  minPlayers={minPlayers}
                />
              </Panel>
            )}
          </Stack>
        </Box>
      )}
      <MetaPlayersDrawer
        filter={players}
        search={search}
        onClose={() => {
          setPlayers(null);
        }}
      />
    </Stack>
  );
}
