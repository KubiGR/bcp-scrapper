import type { MetaRow } from '@bcp/shared';
import { Input, SegmentedControl, Stack, Select, Text, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { FactionIcon } from '../../components/FactionIcon';
import { ErrorState } from '../../components/ErrorState';
import { FilterToggle } from '../../components/FilterToggle';
import { Panel } from '../../components/Panel';
import {
  Card,
  CardGroup,
  PageTitle,
  scoreboardClasses,
  SidebarLayout,
  Stat,
} from '../../components/Scoreboard';
import { plural } from '../../lib/format';
import { sortRows, type SortDir, type SortValue } from '../../lib/table-sort';
import { useDraftRange } from '../../lib/use-draft-range';
import { OVERREP_TITLE, OverrepText, ReliableText } from './FactionTable';
import { groupByTier, tierOf, tierPercent, winRateFill, type Tier } from './faction-tiers';
import classes from './FactionsPage.module.css';
import { changeSpans, EVENT_TYPES } from './MetaPage';
import { Movement, Podium } from './FactionsOverview';
import { DEFAULT_MIN_PLAYERS, metaQuery, sharePercent, type MetaSearch } from './meta-queries';
import { UpdatePicker } from '../updates/UpdatePicker';
import { effectiveOf, updatesQuery, useDateWindow } from '../updates/updates-queries';
import { CardsSkeleton } from '../../components/Skeletons';

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

/** One faction: its name and size, event wins, win rate (bar), reliable win rate, overrep, tier. */
function FactionCard({
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
    <Card
      dense
      className={classes.card}
      data={{ faction: row.faction, dimmed: tier === null, tier: tier?.key ?? 'none' }}
    >
      {rank !== undefined && (
        <span className={`numeric ${classes.rank}`} data-rank>
          {rank}
        </span>
      )}
      <div className={classes.name}>
        <FactionIcon faction={row.faction} size={28} />
        <div className={classes.nameText}>
          <AnchorLink to="/analysis/meta" search={{ ...filters, factions: row.faction }}>
            {row.faction}
          </AnchorLink>
          <Text size="xs" c="dimmed" className={`numeric ${classes.sub}`}>
            {`${plural(row.players, 'player')} · ${sharePercent(row.share)} share · ${plural(row.games, 'game')}`}
          </Text>
        </div>
      </div>
      {wins && (
        <Stat
          className={classes.figure}
          value={
            row.eventWins === 0 ? (
              <Text span c="dimmed" inherit>
                0
              </Text>
            ) : (
              <span aria-label={`${String(row.eventWins)} event wins`}>
                <span aria-hidden className={classes.trophy}>
                  🏆
                </span>{' '}
                {row.eventWins}
              </span>
            )
          }
          label="event wins"
        />
      )}
      <WinRateBar row={row} tier={tier} />
      <Stat className={classes.figure} value={<ReliableText row={row} />} label="reliable" />
      <Stat
        className={classes.figure}
        value={<OverrepText overrep={row.overrep} />}
        label={<span title={OVERREP_TITLE}>overrep</span>}
      />
      <TierBadge tier={tier} />
    </Card>
  );
}

/** The factions as cards: by tier, each tier under its letter; or flat, numbered. */
function FactionCards({
  rows,
  filters,
  flat,
}: {
  rows: KnownRow[];
  filters: MetaFilters;
  flat: boolean;
}) {
  const wins = filters.type !== 'teams';
  if (flat) {
    return (
      <div className={scoreboardClasses.group} data-dense role="list" aria-label="Factions">
        {rows.map((row, index) => (
          <div role="listitem" key={row.faction}>
            <FactionCard row={row} rank={index + 1} filters={filters} wins={wins} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <Stack gap="lg" role="list" aria-label="Factions">
      {groupByTier(rows, DEFAULT_MIN_PLAYERS).map((group) => (
        <div role="listitem" key={group.tier?.key ?? 'few'}>
          <CardGroup
            dense
            label={group.tier?.key ?? '–'}
            description={`${group.tier?.name ?? 'Too few players'} · ${group.tier?.range ?? `under ${String(DEFAULT_MIN_PLAYERS)} players`} · ${plural(group.rows.length, 'faction')}`}
          >
            {group.rows.map((row) => (
              <FactionCard key={row.faction} row={row} filters={filters} wins={wins} />
            ))}
          </CardGroup>
        </div>
      ))}
    </Stack>
  );
}

/** The orders on offer, each its natural way round. */
const SORTS: { value: Column; label: string; dir: SortDir }[] = [
  { value: 'winRate', label: 'Win rate', dir: 'desc' },
  { value: 'reliable', label: 'Reliable win rate', dir: 'desc' },
  { value: 'eventWins', label: 'Event wins', dir: 'desc' },
  { value: 'overrep', label: 'Overrep', dir: 'desc' },
  { value: 'faction', label: 'Faction A–Z', dir: 'asc' },
];

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
  // The order picked, for the layout it was picked in; each layout starts from its own default:
  // by tier, the best win rate first; flat, the win rate allowing for sample size.
  const flat = layout === 'flat';
  const [picked, setPicked] = useState<{ flat: boolean; key: Column } | null>(null);
  const sortKey = picked?.flat === flat ? picked.key : flat ? 'reliable' : 'winRate';
  const sortOptions = SORTS.filter(
    (option) => option.value !== 'eventWins' || search.type !== 'teams',
  );
  // Only known factions: the Unknown faction isn't one to compare.
  const known = (meta.data?.factions ?? []).filter((row): row is KnownRow => row.faction !== null);
  const needle = query.trim().toLowerCase();
  const rows = known.filter((row) => row.faction.toLowerCase().includes(needle));

  const sidebar = (
    <FilterToggle active={Number(query.trim() !== '') + Number(search.type !== undefined)}>
      <Panel title="Filters">
        <Stack gap="sm">
          <Select
            label="Sort by"
            data={sortOptions.map(({ value, label }) => ({ value, label }))}
            value={sortKey}
            onChange={(value) => {
              const next = SORTS.find((option) => option.value === value);
              if (next) setPicked({ flat, key: next.value });
            }}
            allowDeselect={false}
          />
          <TextInput
            aria-label="Search factions"
            placeholder="Search factions…"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
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
          <Input.Wrapper label="Layout">
            <SegmentedControl
              aria-label="Layout"
              fullWidth
              data={VIEWS}
              value={layout ?? 'tiers'}
              onChange={(value) => {
                onSearchChange({ ...search, layout: value === 'flat' ? 'flat' : undefined });
              }}
            />
          </Input.Wrapper>
        </Stack>
      </Panel>
    </FilterToggle>
  );

  return (
    <SidebarLayout sidebarLabel="Filters" sidebar={sidebar}>
      <Stack gap="lg">
        <div>
          <PageTitle>Factions</PageTitle>
          <Text c="dimmed" mt={4}>
            Grouped by win rate at big events; each opens its archetypes on Meta
          </Text>
        </div>

        {meta.isPending && <CardsSkeleton label="Loading factions" cards={4} dense />}
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
                {rows.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No faction matches “{query.trim()}”.
                  </Text>
                ) : (
                  <FactionCards
                    rows={sortRows(
                      rows,
                      VALUES[sortKey],
                      SORTS.find((option) => option.value === sortKey)?.dir ?? 'desc',
                    )}
                    filters={filters}
                    flat={flat}
                  />
                )}
              </Panel>
            </Stack>
          ))}
      </Stack>
    </SidebarLayout>
  );
}
