import type { MetaRow } from '@bcp/shared';
import {
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { FactionIcon } from '../../components/FactionIcon';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { plural } from '../../lib/format';
import { SortableTh, useTableSort, type SortValue } from '../../lib/table-sort';
import { useDraftRange } from '../../lib/use-draft-range';
import { OVERREP_TITLE, OverrepText, ReliableText } from './FactionTable';
import { groupByTier, tierOf, tierPercent, winRateFill, type Tier } from './faction-tiers';
import classes from './FactionsPage.module.css';
import { changeSpans, EVENT_TYPES } from './MetaPage';
import { Movement, Podium } from './FactionsOverview';
import { DEFAULT_MIN_PLAYERS, metaQuery, sharePercent, type MetaSearch } from './meta-queries';
import { UpdatePicker } from '../updates/UpdatePicker';
import { effectiveOf, updatesQuery, useDateWindow } from '../updates/updates-queries';

/** The Factions page's URL search: the Meta API's filters, and the table's layout. */
export type FactionsSearch = Pick<MetaSearch, 'from' | 'to' | 'type'> & {
  /** The table's layout; undefined = by tier. */
  layout?: 'flat';
};

type MetaFilters = Omit<FactionsSearch, 'layout'>;

interface FactionsPageProps {
  search: FactionsSearch;
  onSearchChange: (next: FactionsSearch) => void;
}

type Column = 'faction' | 'eventWins' | 'winRate' | 'reliable' | 'overrep';

type KnownRow = MetaRow & { faction: string };

const VALUES: Record<Column, SortValue<KnownRow>> = {
  faction: (row) => row.faction,
  eventWins: (row) => row.eventWins,
  winRate: (row) => row.winRate,
  reliable: (row) => row.reliableWinRate,
  overrep: (row) => row.overrep ?? 0,
};

const VIEWS = [
  { value: 'tiers', label: 'By tier' },
  { value: 'flat', label: 'Flat ranking' },
];

function TierBadge({ tier }: { tier: Tier | null }) {
  return (
    <span
      className={classes.badge}
      data-tier={tier?.key ?? 'none'}
      title={tier === null ? `Fewer than ${String(DEFAULT_MIN_PLAYERS)} players` : tier.name}
    >
      {tier?.key ?? '–'}
    </span>
  );
}

/** The win rate over a bar that fills from even (50%) towards it, in its tier's colour. */
function WinRateBar({ row, tier }: { row: KnownRow; tier: Tier | null }) {
  const fill = winRateFill(row.winRate);
  return (
    <div className={classes.rate} data-tier={tier?.key ?? 'none'}>
      <Text size="sm" fw={600} className={`numeric ${classes.rateText}`} component="span">
        {tierPercent(row.winRate)}
      </Text>
      <div className={classes.rateTrack} aria-hidden>
        <div
          className={classes.rateFill}
          data-rate-fill
          style={{ left: `${String(fill.left)}%`, width: `${String(fill.width)}%` }}
        />
      </div>
    </div>
  );
}

function FactionRow({
  row,
  rank,
  filters,
  wins,
}: {
  row: KnownRow;
  /** Its place in the flat ranking; undefined by tier. */
  rank?: number;
  /** The Meta filters, for the faction's link. */
  filters: MetaFilters;
  /** Show event wins (not at team events, which don't count them). */
  wins: boolean;
}) {
  const tier = row.players < DEFAULT_MIN_PLAYERS ? null : tierOf(row.winRate);
  return (
    <Table.Tr data-faction={row.faction} data-dimmed={tier === null} className={classes.row}>
      {rank !== undefined && (
        <Table.Td className={`numeric ${classes.rank}`} w={40}>
          {rank}
        </Table.Td>
      )}
      <Table.Td className={classes.name} data-tier={tier?.key ?? 'none'}>
        <FactionIcon faction={row.faction} size={28} />
        <AnchorLink to="/analysis/meta" search={{ ...filters, factions: row.faction }}>
          {row.faction}
        </AnchorLink>
        <Text size="xs" c="dimmed" className={`numeric ${classes.sub}`}>
          {`${plural(row.players, 'player')} · ${sharePercent(row.share)} share · ${plural(row.games, 'game')}`}
        </Text>
      </Table.Td>
      {wins && (
        <Table.Td ta="right" visibleFrom="sm">
          {row.eventWins === 0 ? (
            <Text size="sm" c="dimmed" className="numeric" component="span">
              0
            </Text>
          ) : (
            <Text
              size="sm"
              className="numeric"
              component="span"
              aria-label={`${String(row.eventWins)} event wins`}
            >
              <span aria-hidden className={classes.trophy}>
                🏆
              </span>{' '}
              {row.eventWins}
            </Text>
          )}
        </Table.Td>
      )}
      <Table.Td>
        <WinRateBar row={row} tier={tier} />
      </Table.Td>
      <Table.Td ta="right" visibleFrom="sm">
        <ReliableText row={row} />
      </Table.Td>
      <Table.Td ta="right" visibleFrom="sm">
        <OverrepText overrep={row.overrep} />
      </Table.Td>
      <Table.Td ta="center" w={56}>
        <TierBadge tier={tier} />
      </Table.Td>
    </Table.Tr>
  );
}

/** A tier's heading row: badge, name, the win rates it covers and how many factions are in it. */
function TierHeading({
  tier,
  count,
  columns,
}: {
  tier: Tier | null;
  count: number;
  columns: number;
}) {
  return (
    <Table.Tr className={classes.heading} data-tier-heading>
      <Table.Th colSpan={columns} scope="rowgroup">
        <Group gap="sm" wrap="nowrap">
          <TierBadge tier={tier} />
          <Text fw={700} size="sm" component="span">
            {tier?.name ?? 'Too few players'}
          </Text>
          <Text size="xs" c="dimmed" className="numeric" component="span">
            {tier?.range ?? `under ${String(DEFAULT_MIN_PLAYERS)} players`}
          </Text>
          <Text size="xs" c="dimmed" className="numeric" component="span" ml="auto">
            {plural(count, 'faction')}
          </Text>
        </Group>
      </Table.Th>
    </Table.Tr>
  );
}

function FactionsTable({
  rows,
  filters,
  flat,
}: {
  rows: KnownRow[];
  filters: MetaFilters;
  flat: boolean;
}) {
  const wins = filters.type !== 'teams';
  // By tier, the best win rate first within each tier; flat, the win rate allowing for sample
  // size, so a big solid faction outranks a small lucky one.
  const { sorted, sort, toggle } = useTableSort<KnownRow, Column>(rows, VALUES, {
    key: flat ? 'reliable' : 'winRate',
    dir: 'desc',
  });
  const columns = 5 + Number(flat) + Number(wins);
  return (
    <Table.ScrollContainer minWidth={0}>
      <Table aria-label="Factions" highlightOnHover verticalSpacing="sm" className={classes.table}>
        <Table.Thead>
          <Table.Tr>
            {flat && <Table.Th w={40}>#</Table.Th>}
            <SortableTh column="faction" sort={sort} onSort={toggle}>
              Faction
            </SortableTh>
            {wins && (
              <SortableTh
                column="eventWins"
                sort={sort}
                onSort={toggle}
                ta="right"
                visibleFrom="sm"
                title="Singles events won (team events don’t count)"
              >
                Wins
              </SortableTh>
            )}
            <SortableTh column="winRate" sort={sort} onSort={toggle}>
              Win rate
            </SortableTh>
            <SortableTh
              column="reliable"
              sort={sort}
              onSort={toggle}
              ta="right"
              visibleFrom="sm"
              title="The win rate allowing for how many games there are: the low end of its 95% range. Few games pull it down."
            >
              Reliable
            </SortableTh>
            <SortableTh
              column="overrep"
              sort={sort}
              onSort={toggle}
              ta="right"
              visibleFrom="sm"
              title={OVERREP_TITLE}
            >
              Overrep
            </SortableTh>
            <Table.Th ta="center" w={56}>
              Tier
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {flat
            ? sorted.map((row, index) => (
                <FactionRow
                  key={row.faction}
                  row={row}
                  rank={index + 1}
                  filters={filters}
                  wins={wins}
                />
              ))
            : groupByTier(sorted, DEFAULT_MIN_PLAYERS).map((group) => (
                <Fragment key={group.tier?.key ?? 'few'}>
                  <TierHeading tier={group.tier} count={group.rows.length} columns={columns} />
                  {group.rows.map((row) => (
                    <FactionRow key={row.faction} row={row} filters={filters} wins={wins} />
                  ))}
                </Fragment>
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
  const { layout, ...filters } = search;
  // Movement compares the latest game update in range with the one before it, when they're known.
  const updates = useQuery(updatesQuery);
  const window = useDateWindow(filters);
  const change = changeSpans(effectiveOf(updates.data), window.to);
  const meta = useQuery(metaQuery(filters, change?.spans));
  const dates = useDraftRange(window, (range) => {
    onSearchChange({ ...search, from: range.from, to: range.to });
  });
  const [query, setQuery] = useState('');
  // Only known factions: the Unknown faction isn't one to compare.
  const known = (meta.data?.factions ?? []).filter((row): row is KnownRow => row.faction !== null);
  const needle = query.trim().toLowerCase();
  const rows = known.filter((row) => row.faction.toLowerCase().includes(needle));

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
          from={window.from}
          to={window.to}
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
        ) : known.length === 0 ? (
          <Text size="sm" c="dimmed">
            No players with games yet.
          </Text>
        ) : (
          <Stack
            gap="lg"
            style={{ opacity: meta.isPlaceholderData ? 0.6 : 1 }}
            aria-busy={meta.isFetching}
          >
            <Podium rows={known} filters={filters} />
            <Movement
              rows={known}
              filters={filters}
              label={change?.label ?? 'Last 30 days vs the 30 before'}
            />
            <Panel
              title={`${plural(meta.data.totals.players, 'player')} · ${plural(meta.data.eventsLoaded, 'event')}`}
            >
              <Group gap="sm" mb="md" wrap="wrap">
                <TextInput
                  aria-label="Search factions"
                  placeholder="Search factions…"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                  }}
                  w={{ base: '100%', xs: 240 }}
                />
                <SegmentedControl
                  aria-label="Layout"
                  data={VIEWS}
                  value={layout ?? 'tiers'}
                  onChange={(value) => {
                    onSearchChange({ ...search, layout: value === 'flat' ? 'flat' : undefined });
                  }}
                  ml={{ xs: 'auto' }}
                />
              </Group>
              {rows.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No faction matches “{query.trim()}”.
                </Text>
              ) : (
                // Keyed by layout: each starts from its own default sort.
                <FactionsTable
                  key={layout ?? 'tiers'}
                  rows={rows}
                  filters={filters}
                  flat={layout === 'flat'}
                />
              )}
            </Panel>
          </Stack>
        ))}
    </Stack>
  );
}
