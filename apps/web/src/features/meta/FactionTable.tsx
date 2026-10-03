import { MIN_CHANGE_GAMES, type MetaRow } from '@bcp/shared';
import { ActionIcon, Table, Text, UnstyledButton, useMatches } from '@mantine/core';
import { Fragment } from 'react';
import { SortableTh, type SortDir } from '../../lib/table-sort';
import { DispositionBreakdown } from './DispositionBreakdown';
import { Sparkline } from './Sparkline';
import {
  DEFAULT_CHANGE_LABEL,
  percent,
  reliableTone,
  sharePercent,
  winRateTone,
  type MetaSort,
} from './meta-queries';

/** A row's players, for the drill-down: `detachments` undefined = the whole faction. */
export interface PlayersFilter {
  faction: string | null;
  detachments?: string[] | null;
}

export const factionKey = (faction: string | null) => faction ?? '(unknown)';
export const factionName = (faction: string | null) => faction ?? 'Unknown faction';
/** Players whose list names no detachment, or one that isn't English (Meta can't tell those apart). */
export const UNKNOWN_DETACHMENT = 'Detachment unknown or not in English';
const archetypeName = (detachments: string[] | null) =>
  detachments === null ? UNKNOWN_DETACHMENT : detachments.join(' + ');

// Blue and orange, like the Matchups colours: apart for colour-blind readers too.
export const TONE_COLOR = { good: 'blue.4', bad: 'orange.5', even: undefined } as const;

interface FactionTableProps {
  rows: MetaRow[];
  /** What Change compares, for its header's tooltip (default: the last 30 days vs the 30 before). */
  changeLabel?: string;
  /** The weeks each row's trend follows. */
  weeks: string[];
  minPlayers: number;
  sort: MetaSort;
  dir: SortDir;
  expanded: string[];
  /** The next sort; null = back to the default. */
  onSortChange: (next: { sort: MetaSort; dir: SortDir } | null) => void;
  onToggle: (key: string) => void;
  onOpenPlayers: (filter: PlayersFilter) => void;
}

/** Win rate in the range's last 30 days minus the 30 before; null without enough games. */
export const changeOf = (row: Pick<MetaRow, 'change'>) => row.change;

/** "+4.2 pp" / "−3.0 pp"; a change that rounds to 0 is neutral. */
function ChangeText({ change }: { change: number | null }) {
  if (change === null) {
    return (
      <Text
        size="sm"
        c="dimmed"
        component="span"
        title={`Fewer than ${String(MIN_CHANGE_GAMES)} games in one of the two 30-day spans`}
      >
        –
      </Text>
    );
  }
  const points = Math.round(change * 1000) / 10;
  const tone = points > 0 ? 'good' : points < 0 ? 'bad' : 'even';
  const text =
    points === 0 ? '0.0 pp' : `${points > 0 ? '+' : '−'}${Math.abs(points).toFixed(1)} pp`;
  return (
    <Text size="sm" className="numeric" c={TONE_COLOR[tone]} data-tone={tone} component="span">
      {text}
    </Text>
  );
}

/** A win rate coloured by the win-rate tone: blue above 55 %, orange below 45 %. */
export function WinRateText({ rate }: { rate: number }) {
  return <ToneText tone={winRateTone(rate)}>{percent(rate)}</ToneText>;
}

/** A reliable win rate: blue from 50 %, orange below 45 %. */
export function ReliableText({ row }: { row: Pick<MetaRow, 'reliableWinRate'> }) {
  return (
    <ToneText tone={reliableTone(row.reliableWinRate)}>{percent(row.reliableWinRate)}</ToneText>
  );
}

function ToneText({ tone, children }: { tone: 'good' | 'bad' | 'even'; children: string }) {
  return (
    <Text size="sm" className="numeric" c={TONE_COLOR[tone]} data-tone={tone} component="span">
      {children}
    </Text>
  );
}

export function Figures({
  row,
  weeks,
  label,
  onOpen,
}: {
  row: Pick<
    MetaRow,
    | 'players'
    | 'share'
    | 'games'
    | 'winRate'
    | 'reliableWinRate'
    | 'change'
    | 'trend'
    | 'x1'
    | 'x1Share'
  >;
  /** The weeks `row.trend` follows. */
  weeks: string[];
  label: string;
  onOpen: () => void;
}) {
  return (
    <>
      <Table.Td ta="right">
        <UnstyledButton
          className="numeric"
          onClick={onOpen}
          aria-label={`${row.players} ${label} players`}
        >
          <Text size="sm" td="underline" component="span">
            {row.players}
          </Text>
        </UnstyledButton>
      </Table.Td>
      <Table.Td ta="right" className="numeric" visibleFrom="sm">
        {sharePercent(row.share)}
      </Table.Td>
      <Table.Td visibleFrom="sm">
        <Sparkline values={row.trend} weeks={weeks} />
      </Table.Td>
      <Table.Td ta="right">
        <WinRateText rate={row.winRate} />
      </Table.Td>
      <Table.Td ta="right">
        <ReliableText row={row} />
      </Table.Td>
      <Table.Td ta="right" visibleFrom="sm">
        <ChangeText change={changeOf(row)} />
      </Table.Td>
      <Table.Td ta="right" className="numeric" visibleFrom="sm">
        {`${row.x1} · ${percent(row.x1Share)}`}
      </Table.Td>
    </>
  );
}

/**
 * Factions by popularity (or win rate / X-1), each expandable into its archetypes. Rows under the
 * minimum players, and the Unknown faction, are dimmed and sorted last.
 */
export function FactionTable({
  changeLabel = DEFAULT_CHANGE_LABEL,
  rows,
  weeks,
  minPlayers,
  sort,
  dir,
  expanded,
  onSortChange,
  onToggle,
  onOpenPlayers,
}: FactionTableProps) {
  // Phones drop Share and X-1 (see the cells), so the rest fits without scrolling.
  const tableMinWidth = useMatches({ base: 0, sm: 560 });
  const sign = dir === 'asc' ? 1 : -1;
  const dimmed = (row: MetaRow) => row.faction === null || row.players < minPlayers;
  type Measured = Pick<MetaRow, 'players' | 'winRate' | 'reliableWinRate' | 'change' | 'x1Share'>;
  const metric = (row: Measured) =>
    sort === 'winRate'
      ? row.winRate
      : sort === 'reliable'
        ? row.reliableWinRate
        : sort === 'change'
          ? (changeOf(row) ?? 0)
          : sort === 'x1'
            ? row.x1Share
            : row.players;
  // Sorting by change, rows without one (too few games) go last either way.
  const newLast = (a: Measured, b: Measured) =>
    sort === 'change' ? Number(changeOf(a) === null) - Number(changeOf(b) === null) : 0;
  const byName = (a: MetaRow, b: MetaRow) =>
    factionName(a.faction).localeCompare(factionName(b.faction));
  const sorted = [...rows].sort(
    (a, b) =>
      Number(dimmed(a)) - Number(dimmed(b)) ||
      Number(a.faction === null) - Number(b.faction === null) ||
      newLast(a, b) ||
      sign * (sort === 'faction' ? byName(a, b) : metric(a) - metric(b)) ||
      b.players - a.players ||
      byName(a, b),
  );
  // Detachment rows follow the same rules: the chosen column, small ones and "unknown" last.
  const sortArchetypes = (archetypes: MetaRow['archetypes']) =>
    [...archetypes].sort((a, b) => {
      const small = (x: typeof a) => x.players < minPlayers;
      return (
        Number(a.detachments === null) - Number(b.detachments === null) ||
        Number(small(a)) - Number(small(b)) ||
        newLast(a, b) ||
        sign *
          (sort === 'faction'
            ? archetypeName(a.detachments).localeCompare(archetypeName(b.detachments))
            : metric(a) - metric(b)) ||
        b.players - a.players
      );
    });
  // First click: numbers high to low, names A→Z; second flips; third goes back to the default.
  const onSort = (key: MetaSort) => {
    const first: SortDir = key === 'faction' ? 'asc' : 'desc';
    if (key !== sort) onSortChange({ sort: key, dir: first });
    else if (dir === first) onSortChange({ sort: key, dir: first === 'asc' ? 'desc' : 'asc' });
    else onSortChange(null);
  };
  const state = { key: sort, dir };

  return (
    <Table.ScrollContainer minWidth={tableMinWidth}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <SortableTh column="faction" sort={state} onSort={onSort}>
              Faction
            </SortableTh>
            <SortableTh column="players" sort={state} onSort={onSort} ta="right">
              Players
            </SortableTh>
            <Table.Th ta="right" visibleFrom="sm">
              Share
            </Table.Th>
            <Table.Th ta="right" visibleFrom="sm">
              Trend
            </Table.Th>
            <SortableTh column="winRate" sort={state} onSort={onSort} ta="right">
              Win rate
            </SortableTh>
            <SortableTh
              column="reliable"
              sort={state}
              onSort={onSort}
              ta="right"
              title="The win rate allowing for how many games there are: the low end of its 95% range. Few games pull it down."
            >
              Reliable
            </SortableTh>
            <SortableTh
              column="change"
              sort={state}
              onSort={onSort}
              ta="right"
              visibleFrom="sm"
              title={changeLabel}
            >
              Change
            </SortableTh>
            <SortableTh column="x1" sort={state} onSort={onSort} ta="right" visibleFrom="sm">
              X-1 or better
            </SortableTh>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((row) => {
            const key = factionKey(row.faction);
            const name = factionName(row.faction);
            const open = expanded.includes(key);
            return (
              <Fragment key={key}>
                <Table.Tr data-dimmed={dimmed(row)} style={{ opacity: dimmed(row) ? 0.55 : 1 }}>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      mr={6}
                      aria-label={`Show ${name} detachments`}
                      aria-expanded={open}
                      onClick={() => {
                        onToggle(key);
                      }}
                    >
                      {open ? '▾' : '▸'}
                    </ActionIcon>
                    {name}
                  </Table.Td>
                  <Figures
                    weeks={weeks}
                    row={row}
                    label={name}
                    onOpen={() => {
                      onOpenPlayers({ faction: row.faction });
                    }}
                  />
                </Table.Tr>
                {open &&
                  sortArchetypes(row.archetypes).map((archetype) => {
                    const label = archetypeName(archetype.detachments);
                    const small = archetype.players < minPlayers;
                    return (
                      <Table.Tr
                        key={`${key}:${label}`}
                        data-dimmed={small}
                        style={{ opacity: small ? 0.55 : 1 }}
                      >
                        <Table.Td pl={40}>
                          <Text size="sm" c="dimmed" component="span">
                            {label}
                          </Text>
                          <DispositionBreakdown archetype={archetype} />
                        </Table.Td>
                        <Figures
                          weeks={weeks}
                          row={archetype}
                          label={`${name} · ${label}`}
                          onOpen={() => {
                            onOpenPlayers({
                              faction: row.faction,
                              detachments: archetype.detachments,
                            });
                          }}
                        />
                      </Table.Tr>
                    );
                  })}
              </Fragment>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
