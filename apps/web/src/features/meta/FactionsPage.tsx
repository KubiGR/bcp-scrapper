import type { MetaRow } from '@bcp/shared';
import { Box, Group, SegmentedControl, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { plural } from '../../lib/format';
import { SortableTh, useTableSort, type SortValue } from '../../lib/table-sort';
import { useDraftRange } from '../../lib/use-draft-range';
import { OVERREP_TITLE, OverrepText, ReliableText, WinRateText } from './FactionTable';
import classes from './FactionsPage.module.css';
import { EVENT_TYPES } from './MetaPage';
import { metaQuery, metaWindow, sharePercent, type MetaSearch } from './meta-queries';
import { UpdatePicker } from '../updates/UpdatePicker';

/** The Factions page's URL search: the Meta API's filters only. */
export type FactionsSearch = Pick<MetaSearch, 'from' | 'to' | 'type'>;

interface FactionsPageProps {
  search: FactionsSearch;
  onSearchChange: (next: FactionsSearch) => void;
}

type Column = 'faction' | 'players' | 'winRate' | 'reliable' | 'overrep';

const VALUES: Record<Column, SortValue<MetaRow & { faction: string }>> = {
  faction: (row) => row.faction,
  players: (row) => row.players,
  winRate: (row) => row.winRate,
  reliable: (row) => row.reliableWinRate,
  overrep: (row) => row.overrep ?? 0,
};

type KnownRow = MetaRow & { faction: string };

function FactionsTable({ rows, search }: { rows: KnownRow[]; search: FactionsSearch }) {
  // Win rate allowing for sample size first: a big solid faction outranks a small lucky one.
  const { sorted, sort, toggle } = useTableSort<KnownRow, Column>(rows, VALUES, {
    key: 'reliable',
    dir: 'desc',
  });
  const widest = Math.max(0, ...rows.map((row) => row.share));
  return (
    <Table.ScrollContainer minWidth={560}>
      <Table aria-label="Factions" striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <SortableTh column="faction" sort={sort} onSort={toggle}>
              Faction
            </SortableTh>
            <Table.Th ta="right">Share</Table.Th>
            <SortableTh column="players" sort={sort} onSort={toggle} ta="right">
              Players
            </SortableTh>
            <SortableTh column="winRate" sort={sort} onSort={toggle} ta="right">
              Win rate
            </SortableTh>
            <SortableTh column="reliable" sort={sort} onSort={toggle} ta="right">
              Reliable
            </SortableTh>
            <SortableTh
              column="overrep"
              sort={sort}
              onSort={toggle}
              ta="right"
              title={OVERREP_TITLE}
            >
              Overrep
            </SortableTh>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((row) => (
            <Table.Tr key={row.faction}>
              <Table.Td>
                <AnchorLink to="/analysis/meta" search={{ ...search, factions: row.faction }}>
                  {row.faction}
                </AnchorLink>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" wrap="nowrap" justify="flex-end">
                  <div className={classes.track} aria-hidden>
                    <div
                      className={classes.bar}
                      data-share-bar
                      style={{ width: `${String(widest === 0 ? 0 : (row.share / widest) * 100)}%` }}
                    />
                  </div>
                  <Text size="sm" className="numeric" w={48} ta="right">
                    {sharePercent(row.share)}
                  </Text>
                </Group>
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {row.players}
              </Table.Td>
              <Table.Td ta="right">
                <WinRateText rate={row.winRate} />
              </Table.Td>
              <Table.Td ta="right">
                <ReliableText row={row} />
              </Table.Td>
              <Table.Td ta="right">
                <OverrepText overrep={row.overrep} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/**
 * Every faction's share of the players at big events and how it does, by reliable win rate; each
 * opens its archetypes on Meta.
 */
export function FactionsPage({ search, onSearchChange }: FactionsPageProps) {
  const meta = useQuery(metaQuery(search));
  const dates = useDraftRange(metaWindow(search, new Date()), (range) => {
    onSearchChange({ ...search, from: range.from, to: range.to });
  });
  // Only known factions: the Unknown faction isn't one to compare.
  const rows = (meta.data?.factions ?? []).filter((row): row is KnownRow => row.faction !== null);

  return (
    <Stack gap="lg">
      <Title order={1}>Factions</Title>
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
      </Group>

      {meta.isPending && <Skeleton height={240} />}
      {meta.error && <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />}
      {meta.data &&
        (meta.data.eventsInRange === 0 ? (
          <Text size="sm" c="dimmed">
            No big events in this range.
          </Text>
        ) : rows.length === 0 ? (
          <Text size="sm" c="dimmed">
            No players with games yet.
          </Text>
        ) : (
          <Box style={{ opacity: meta.isPlaceholderData ? 0.6 : 1 }} aria-busy={meta.isFetching}>
            <Panel
              title={`${plural(meta.data.totals.players, 'player')} · ${plural(meta.data.eventsLoaded, 'event')}`}
            >
              <FactionsTable rows={rows} search={search} />
            </Panel>
          </Box>
        ))}
    </Stack>
  );
}
