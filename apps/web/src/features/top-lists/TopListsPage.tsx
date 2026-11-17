import { DETACHMENT_SEPARATOR, KNOWN_DISPOSITIONS } from '@bcp/shared';
import { Alert, Box, MultiSelect, Select, Skeleton, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DispositionText } from '../../components/DispositionText';
import { ErrorState } from '../../components/ErrorState';
import { FilterToggle } from '../../components/FilterToggle';
import { Panel } from '../../components/Panel';
import { PageTitle, SidebarLayout } from '../../components/Scoreboard';
import { plural } from '../../lib/format';
import { useDraftRange } from '../../lib/use-draft-range';
import { ListDrawer } from '../event/ListDrawer';
import { lossLabel } from '../event/players-filter';
import {
  FoundPlayerCards,
  FoundSortSelect,
  sortFound,
  type FoundPlayer,
  type SortKey,
} from './FoundPlayers';
import { useDateWindow } from '../updates/updates-queries';
import { topListsQuery, type TopListsSearch } from './top-lists-queries';
import { UpdatePicker } from '../updates/UpdatePicker';
import { renderFactionOption, renderFactionPill } from '../../components/FactionIcon';

const LOSS_CHOICES = [0, 1, 2, 3, 4, 5];
/** 1 is any big event; the default 4 keeps X-1 at 3-1 or better. */
const ROUND_CHOICES = [1, 3, 4, 5, 6, 7, 8];
const DEFAULT_MIN_ROUNDS = 4;
const roundsLabel = (rounds: number) => (rounds === 1 ? 'Any' : `${rounds}+ rounds`);

const split = (value: string | undefined, separator = ',') =>
  value?.split(separator).filter(Boolean) ?? [];
const join = (values: string[], separator = ',') =>
  values.length === 0 ? undefined : values.join(separator);
const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

interface TopListsPageProps {
  search: TopListsSearch;
  onSearchChange: (next: TopListsSearch) => void;
}

/** Players of big events who went X-n or better, across events, with their lists. */
export function TopListsPage({ search, onSearchChange }: TopListsPageProps) {
  const minRounds = search.minRounds ?? DEFAULT_MIN_ROUNDS;
  const results = useQuery(topListsQuery({ ...search, minRounds }));
  // The open result, by key: the drawer follows the refreshed results (e.g. after "Fetch this list").
  const [openKey, setOpenKey] = useState<{ eventId: string; bcpId: string } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('record');
  const window = useDateWindow(search);
  const dates = useDraftRange(window, (range) => {
    onSearchChange({ ...search, from: range.from, to: range.to });
  });

  const factions = split(search.factions);
  const dispositions = split(search.dispositions);
  const detachments = split(search.detachments, DETACHMENT_SEPARATOR);
  const found = results.data?.players ?? [];
  // Stable, so the same record keeps the API's order: higher Elo first.
  const sorted = sortFound(found, sortKey);
  const open =
    openKey === null
      ? null
      : (found.find((p) => p.eventId === openKey.eventId && p.bcpId === openKey.bcpId) ?? null);
  const openPlayer = (player: FoundPlayer) => {
    setOpenKey({ eventId: player.eventId, bcpId: player.bcpId });
  };
  const maxLosses = search.maxLosses ?? 1;
  const notLoaded = results.data ? results.data.eventsInRange - results.data.eventsLoaded : 0;

  return (
    <SidebarLayout
      sidebarLabel="Filters"
      sidebar={
        <FilterToggle
          active={
            [factions, dispositions, detachments].filter((chosen) => chosen.length > 0).length
          }
        >
          <Panel title="Filters">
            <Stack gap="md">
              <FoundSortSelect value={sortKey} onChange={setSortKey} />
              <MultiSelect
                label="Factions"
                renderOption={renderFactionOption}
                renderPill={renderFactionPill}
                placeholder={factions.length === 0 ? 'All factions' : undefined}
                data={uniqueSorted([...(results.data?.factionOptions ?? []), ...factions])}
                value={factions}
                onChange={(value) => {
                  onSearchChange({ ...search, factions: join(value) });
                }}
                searchable
                clearable
              />
              <Select
                label="Record"
                data={LOSS_CHOICES.map((n) => ({ value: String(n), label: lossLabel(n) }))}
                value={String(maxLosses)}
                onChange={(value) => {
                  if (value !== null) onSearchChange({ ...search, maxLosses: Number(value) });
                }}
                allowDeselect={false}
              />
              <Select
                label="Min rounds"
                data={ROUND_CHOICES.map((n) => ({ value: String(n), label: roundsLabel(n) }))}
                value={String(minRounds)}
                onChange={(value) => {
                  if (value !== null) onSearchChange({ ...search, minRounds: Number(value) });
                }}
                allowDeselect={false}
              />
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
              <MultiSelect
                label="Disposition"
                placeholder={dispositions.length === 0 ? 'All dispositions' : undefined}
                data={uniqueSorted([...KNOWN_DISPOSITIONS, ...dispositions])}
                value={dispositions}
                onChange={(value) => {
                  onSearchChange({ ...search, dispositions: join(value) });
                }}
                renderOption={({ option }) => <DispositionText disposition={option.value} />}
                clearable
              />
              <MultiSelect
                label="Detachment"
                placeholder={detachments.length === 0 ? 'All detachments' : undefined}
                data={uniqueSorted([...(results.data?.detachmentOptions ?? []), ...detachments])}
                value={detachments}
                onChange={(value) => {
                  onSearchChange({ ...search, detachments: join(value, DETACHMENT_SEPARATOR) });
                }}
                searchable
                clearable
              />
            </Stack>
          </Panel>
        </FilterToggle>
      }
    >
      <Stack gap="lg">
        <PageTitle>Top lists</PageTitle>
        {results.data && (
          <Text c="dimmed">
            {plural(found.length, 'player')}
            {results.data.truncated ? '+' : ''} at {lossLabel(maxLosses)}
            {factions.length > 0 ? `, ${factions.join(', ')}` : ''}
          </Text>
        )}

        {results.isPending && <Skeleton height={200} />}
        {results.error && (
          <ErrorState error={results.error} onRetry={() => void results.refetch()} />
        )}
        {results.data && (
          <Box
            style={{ opacity: results.isPlaceholderData ? 0.6 : 1 }}
            aria-busy={results.isFetching}
          >
            <Stack gap="lg">
              {notLoaded > 0 && (
                <Text size="sm" c="dimmed">
                  {plural(notLoaded, 'big event')} in this range{' '}
                  {notLoaded === 1 ? 'isn’t' : 'aren’t'} loaded yet, so their players aren’t
                  searched.
                </Text>
              )}
              {results.data.truncated && (
                <Alert color="yellow">
                  Showing the first 500 — narrow the search to see the rest.
                </Alert>
              )}
              {found.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No players match. Try more losses, other factions or a wider range.
                </Text>
              ) : (
                <FoundPlayerCards players={sorted} sortKey={sortKey} onOpen={openPlayer} />
              )}
            </Stack>
          </Box>
        )}
      </Stack>
      <ListDrawer
        eventId={open?.eventId ?? ''}
        player={open}
        onClose={() => {
          setOpenKey(null);
        }}
      />
    </SidebarLayout>
  );
}
