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
import { ArchetypeTable } from './ArchetypeTable';
import { FactionTable, type PlayersFilter } from './FactionTable';
import {
  DEFAULT_MIN_PLAYERS,
  metaQuery,
  metaWindow,
  type MetaSearch,
  type MetaSort,
} from './meta-queries';
import { MetaPlayersDrawer } from './MetaPlayersDrawer';
import { TeamMeta } from './TeamMeta';
import { UpdatePicker } from '../updates/UpdatePicker';

interface MetaPageProps {
  search: MetaSearch;
  onSearchChange: (next: MetaSearch) => void;
}

const VIEWS = [
  { label: 'Archetypes', value: 'archetypes' },
  { label: 'Armies', value: 'armies' },
];

export const EVENT_TYPES = [
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
  const view = search.view ?? 'archetypes';
  const factions = search.factions?.split('|').filter(Boolean) ?? [];
  // Win rate allowing for sample size: a big solid archetype outranks a small lucky one.
  const sort = search.sort ?? 'reliable';
  const dir = search.dir ?? (sort === 'faction' ? 'asc' : 'desc');
  const onSortChange = (next: { sort: MetaSort; dir: 'asc' | 'desc' } | null) => {
    onSearchChange({ ...search, sort: next?.sort, dir: next?.dir });
  };
  const notLoaded = meta.data ? meta.data.eventsInRange - meta.data.eventsLoaded : 0;

  return (
    <Stack gap="lg">
      <Title order={1}>Meta</Title>
      <Group gap="md" align="flex-end" wrap="wrap">
        <SegmentedControl
          aria-label="View"
          data={VIEWS}
          value={view}
          onChange={(value) => {
            onSearchChange({ ...search, view: value === 'armies' ? 'armies' : undefined });
          }}
        />
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
          from={metaWindow(search, new Date()).from}
          to={metaWindow(search, new Date()).to}
          onChange={(range) => {
            onSearchChange({ ...search, from: range.from, to: range.to });
          }}
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
                {view === 'archetypes' ? (
                  <ArchetypeTable
                    rows={meta.data.factions}
                    weeks={meta.data.weeks}
                    minPlayers={minPlayers}
                    sort={sort}
                    dir={dir}
                    factions={factions}
                    onSortChange={onSortChange}
                    onFactionsChange={(next) => {
                      onSearchChange({
                        ...search,
                        factions: next.length > 0 ? next.join('|') : undefined,
                      });
                    }}
                    onOpenPlayers={setPlayers}
                  />
                ) : (
                  <FactionTable
                    rows={meta.data.factions}
                    weeks={meta.data.weeks}
                    minPlayers={minPlayers}
                    sort={sort}
                    dir={dir}
                    expanded={expanded}
                    onSortChange={onSortChange}
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
                )}
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
