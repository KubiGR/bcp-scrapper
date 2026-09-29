import type { MetaRow } from '@bcp/shared';
import { Box, Group, SegmentedControl, Skeleton, Stack, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { plural } from '../../lib/format';
import { useDraftRange } from '../../lib/use-draft-range';
import { factionName, TONE_COLOR } from './FactionTable';
import classes from './FactionsPage.module.css';
import { EVENT_TYPES } from './MetaPage';
import {
  metaQuery,
  metaWindow,
  percent,
  sharePercent,
  winRateTone,
  type MetaSearch,
} from './meta-queries';

/** The Factions page's URL search: the Meta API's filters only. */
export type FactionsSearch = Pick<MetaSearch, 'from' | 'to' | 'type'>;

interface FactionsPageProps {
  search: FactionsSearch;
  onSearchChange: (next: FactionsSearch) => void;
}

/** Biggest share first, the Unknown faction last. */
const byShare = (a: MetaRow, b: MetaRow) =>
  Number(a.faction === null) - Number(b.faction === null) || b.players - a.players;

function FactionBar({
  row,
  widest,
  search,
}: {
  row: MetaRow;
  widest: number;
  search: FactionsSearch;
}) {
  const tone = winRateTone(row.winRate);
  const name = factionName(row.faction);
  return (
    <li className={classes.item}>
      <Text size="sm" className={classes.name}>
        {row.faction === null ? (
          <Text span inherit c="dimmed" data-name>
            {name}
          </Text>
        ) : (
          <AnchorLink to="/analysis/meta" search={{ ...search, factions: row.faction }}>
            {name}
          </AnchorLink>
        )}
      </Text>
      <div className={classes.track} aria-hidden>
        <div
          className={classes.bar}
          data-unknown={row.faction === null || undefined}
          style={{ width: `${String(widest === 0 ? 0 : (row.share / widest) * 100)}%` }}
        />
      </div>
      <Text size="sm" className={`${classes.figures} numeric`}>
        <Text span inherit fw={600}>
          {sharePercent(row.share)}
        </Text>
        <Text span inherit c="dimmed">
          {' · '}
        </Text>
        <Text span inherit c="dimmed">
          {plural(row.players, 'player')}
        </Text>
        <Text span inherit c="dimmed">
          {' · '}
        </Text>
        <Text span inherit c={TONE_COLOR[tone]} data-tone={tone}>
          {percent(row.winRate)} WR
        </Text>
      </Text>
    </li>
  );
}

/** Every faction's share of the players at big events, as bars; each opens its Meta archetypes. */
export function FactionsPage({ search, onSearchChange }: FactionsPageProps) {
  const meta = useQuery(metaQuery(search));
  const dates = useDraftRange(metaWindow(search, new Date()), (range) => {
    onSearchChange({ ...search, from: range.from, to: range.to });
  });
  const rows = [...(meta.data?.factions ?? [])].sort(byShare);
  const widest = Math.max(0, ...rows.map((row) => row.share));

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
              <ul className={classes.list} aria-label="Factions by share of players">
                {rows.map((row) => (
                  <FactionBar
                    key={row.faction ?? '(unknown)'}
                    row={row}
                    widest={widest}
                    search={search}
                  />
                ))}
              </ul>
            </Panel>
          </Box>
        ))}
    </Stack>
  );
}
