import { addDays, updateOfDay, type EffectiveUpdate } from '@bcp/shared';
import { Box, Input, NumberInput, SegmentedControl, Skeleton, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { FilterToggle } from '../../components/FilterToggle';
import { Panel } from '../../components/Panel';
import { PageTitle, SidebarLayout } from '../../components/Scoreboard';
import { plural } from '../../lib/format';
import { useDraftRange } from '../../lib/use-draft-range';
import { ArchetypeTable } from './ArchetypeTable';
import { FactionTable, type PlayersFilter } from './FactionTable';
import {
  DEFAULT_MIN_PLAYERS,
  metaQuery,
  type ChangeSpans,
  type MetaSearch,
  type MetaSort,
} from './meta-queries';
import { MetaPlayersDrawer } from './MetaPlayersDrawer';
import { TeamMeta } from './TeamMeta';
import { UpdatePicker } from '../updates/UpdatePicker';
import { effectiveOf, updatesQuery, useDateWindow } from '../updates/updates-queries';

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

/**
 * What Meta's Change compares: the update in force on the range's last day (from its start to that
 * day) with the update before it; null without two updates.
 */
export function changeSpans(
  updates: EffectiveUpdate[],
  to: string,
): { spans: ChangeSpans; label: string } | null {
  const latest = updateOfDay(updates, to);
  const previous = latest === null ? undefined : updates[updates.indexOf(latest) - 1];
  if (latest === null || previous === undefined) return null;
  return {
    spans: {
      recentFrom: latest.start,
      recentTo: to,
      priorFrom: previous.start,
      priorTo: addDays(latest.start, -1),
    },
    label: `${latest.name} vs ${previous.name}`,
  };
}

/** Popular factions and archetypes, how they do, and what top teams bring. */
export function MetaPage({ search, onSearchChange }: MetaPageProps) {
  // Change compares the latest game update in range with the one before it, when updates are known.
  const updates = useQuery(updatesQuery);
  const window = useDateWindow(search);
  const change = changeSpans(effectiveOf(updates.data), window.to);
  const meta = useQuery(metaQuery(search, change?.spans));
  const [players, setPlayers] = useState<PlayersFilter | null>(null);
  const dates = useDraftRange(window, (range) => {
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

  const sidebar = (
    <FilterToggle
      active={Number(search.type !== undefined) + Number(minPlayers !== DEFAULT_MIN_PLAYERS)}
    >
      <Panel title="Filters">
        <Stack gap="sm">
          <Input.Wrapper label="View">
            <SegmentedControl
              aria-label="View"
              fullWidth
              data={VIEWS}
              value={view}
              onChange={(value) => {
                onSearchChange({ ...search, view: value === 'armies' ? 'armies' : undefined });
              }}
            />
          </Input.Wrapper>
          <UpdatePicker
            from={window.from}
            to={window.to}
            w="100%"
            onChange={(range) => {
              onSearchChange({ ...search, from: range.from, to: range.to });
            }}
          />
          <DatePickerInput
            type="range"
            label="Dates"
            valueFormat="D MMM YYYY"
            allowSingleDateInRange
            value={dates.draft}
            onChange={dates.onRangeChange}
          />
          <Input.Wrapper label="Event type">
            <SegmentedControl
              aria-label="Event type"
              fullWidth
              data={EVENT_TYPES}
              value={search.type ?? 'all'}
              onChange={(value) => {
                onSearchChange({
                  ...search,
                  type: value === 'singles' || value === 'teams' ? value : undefined,
                });
              }}
            />
          </Input.Wrapper>
          <NumberInput
            label="Min players"
            min={1}
            max={50}
            value={minPlayers}
            onChange={(value) => {
              // Only whole numbers 1–50: a half-typed 0 would otherwise reset to the default.
              if (
                typeof value === 'number' &&
                Number.isInteger(value) &&
                value >= 1 &&
                value <= 50
              ) {
                onSearchChange({ ...search, minPlayers: value });
              }
            }}
          />
        </Stack>
      </Panel>
    </FilterToggle>
  );

  return (
    <SidebarLayout sidebarLabel="Filters" sidebar={sidebar}>
      <Stack gap="lg">
        <div>
          <PageTitle>Meta</PageTitle>
          <Text c="dimmed" mt={4}>
            Popular {view === 'armies' ? 'factions' : 'archetypes'}, how they do, and what top teams
            bring
          </Text>
        </div>

        {meta.isPending && <Skeleton height={240} />}
        {meta.error && <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />}
        {meta.data && (
          <Box style={{ opacity: meta.isPlaceholderData ? 0.6 : 1 }} aria-busy={meta.isFetching}>
            <Stack gap="lg">
              {notLoaded > 0 && (
                <Text size="sm" c="dimmed">
                  {plural(notLoaded, 'big event')} in this range{' '}
                  {notLoaded === 1 ? 'isn’t' : 'aren’t'} loaded yet, so their players aren’t
                  counted.
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
                      changeLabel={change?.label}
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
                      changeLabel={change?.label}
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
    </SidebarLayout>
  );
}
