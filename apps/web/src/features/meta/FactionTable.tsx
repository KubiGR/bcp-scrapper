import { MIN_CHANGE_GAMES, type MetaRow } from '@bcp/shared';
import { ActionIcon, Select, Text, UnstyledButton } from '@mantine/core';
import type { ReactNode } from 'react';
import { Card, scoreboardClasses } from '../../components/Scoreboard';
import { type SortDir } from '../../lib/table-sort';
import classes from './MetaCards.module.css';
import { FactionIcon } from '../../components/FactionIcon';
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
  onToggle: (key: string) => void;
  onOpenPlayers: (filter: PlayersFilter) => void;
}

/** Win rate in the range's last 30 days minus the 30 before; null without enough games. */
export const changeOf = (row: Pick<MetaRow, 'change'>) => row.change;

/** "+4.2 pp" / "−3.0 pp"; a change that rounds to 0 is neutral. */
export function ChangeText({ change }: { change: number | null }) {
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

/** Over-representation among X-1 players: "1.40×", blue from 1.15, orange to 0.85. */
export function OverrepText({ overrep }: { overrep: number | null }) {
  if (overrep === null) {
    return (
      <Text size="sm" c="dimmed" component="span" title="Nobody went X-1 or better">
        –
      </Text>
    );
  }
  const tone = overrep >= 1.15 ? 'good' : overrep <= 0.85 ? 'bad' : 'even';
  return <ToneText tone={tone}>{`${overrep.toFixed(2)}×`}</ToneText>;
}

/** The header's hint for the Overrep column. */
export const OVERREP_TITLE =
  'Over-representation: its share of the X-1-or-better players over its share of all players. 1.00× is as many as its numbers suggest; 1.40× is 40% more.';

/** A figure on a card, its label under it; the label explains itself on hover when given a hint. */
function Figure({
  label,
  hint,
  wide = false,
  hideOnPhone = false,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  hideOnPhone?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={classes.figure}
      data-wide={wide || undefined}
      data-phone-hidden={hideOnPhone || undefined}
    >
      <span className={classes.figureValue}>{children}</span>
      <span className={classes.figureLabel} title={hint}>
        {label}
      </span>
    </div>
  );
}

/** A row's figures as a strip of labelled values; the players open the drill-down. */
export function Figures({
  row,
  weeks,
  label,
  changeLabel = DEFAULT_CHANGE_LABEL,
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
    | 'overrep'
  >;
  /** The weeks `row.trend` follows. */
  weeks: string[];
  label: string;
  /** What Change compares. */
  changeLabel?: string;
  onOpen: () => void;
}) {
  return (
    <div className={classes.figures}>
      <Figure label="players">
        <UnstyledButton
          className="numeric"
          onClick={onOpen}
          aria-label={`${row.players} ${label} players`}
        >
          <Text size="sm" td="underline" component="span">
            {row.players}
          </Text>
        </UnstyledButton>
      </Figure>
      <Figure label="share" hideOnPhone>
        <span className="numeric">{sharePercent(row.share)}</span>
      </Figure>
      <Figure label="trend" wide hideOnPhone>
        <Sparkline values={row.trend} weeks={weeks} />
      </Figure>
      <Figure label="win rate">
        <WinRateText rate={row.winRate} />
      </Figure>
      <Figure
        label="reliable"
        hint="The win rate allowing for how many games there are: the low end of its 95% range. Few games pull it down."
      >
        <ReliableText row={row} />
      </Figure>
      <Figure label="change" hint={changeLabel} hideOnPhone>
        <ChangeText change={changeOf(row)} />
      </Figure>
      <Figure label="X-1 or better" hideOnPhone>
        <span className="numeric">{`${row.x1} · ${percent(row.x1Share)}`}</span>
      </Figure>
      <Figure label="overrep" hint={OVERREP_TITLE} hideOnPhone>
        <OverrepText overrep={row.overrep} />
      </Figure>
    </div>
  );
}

/** The orders Meta offers, each its natural way round; the reliable win rate is the default. */
export const META_SORTS: { value: MetaSort; label: string; dir: SortDir }[] = [
  { value: 'reliable', label: 'Reliable win rate', dir: 'desc' },
  { value: 'winRate', label: 'Win rate', dir: 'desc' },
  { value: 'players', label: 'Players', dir: 'desc' },
  { value: 'change', label: 'Change', dir: 'desc' },
  { value: 'x1', label: 'X-1 or better', dir: 'desc' },
  { value: 'overrep', label: 'Overrep', dir: 'desc' },
  { value: 'faction', label: 'Name A–Z', dir: 'asc' },
];

/** Meta's order, for the sidebar; picking the default clears it from the address. */
export function MetaSortSelect({
  sort,
  onSortChange,
}: {
  sort: MetaSort;
  onSortChange: (next: { sort: MetaSort; dir: SortDir } | null) => void;
}) {
  return (
    <Select
      label="Sort by"
      data={META_SORTS.map(({ value, label }) => ({ value, label }))}
      value={sort}
      onChange={(value) => {
        const next = META_SORTS.find((option) => option.value === value);
        if (next === undefined) return;
        onSortChange(next.value === 'reliable' ? null : { sort: next.value, dir: next.dir });
      }}
      allowDeselect={false}
    />
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
  onToggle,
  onOpenPlayers,
}: FactionTableProps) {
  const sign = dir === 'asc' ? 1 : -1;
  const dimmed = (row: MetaRow) => row.faction === null || row.players < minPlayers;
  type Measured = Pick<
    MetaRow,
    'players' | 'winRate' | 'reliableWinRate' | 'change' | 'x1Share' | 'overrep'
  >;
  const metric = (row: Measured) =>
    sort === 'winRate'
      ? row.winRate
      : sort === 'reliable'
        ? row.reliableWinRate
        : sort === 'change'
          ? (changeOf(row) ?? 0)
          : sort === 'x1'
            ? row.x1Share
            : sort === 'overrep'
              ? (row.overrep ?? 0)
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
  return (
    <div role="list" aria-label="Factions" className={scoreboardClasses.group} data-dense>
      {sorted.map((row) => {
        const key = factionKey(row.faction);
        const name = factionName(row.faction);
        const open = expanded.includes(key);
        return (
          <div role="listitem" key={key}>
            <Card dense data={{ dimmed: dimmed(row) }} className={classes.card}>
              <div className={classes.name}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={`Show ${name} detachments`}
                  aria-expanded={open}
                  onClick={() => {
                    onToggle(key);
                  }}
                >
                  {open ? '▾' : '▸'}
                </ActionIcon>
                <FactionIcon faction={row.faction} size={28} />
                <Text size="sm" fw={600}>
                  {name}
                </Text>
              </div>
              <Figures
                weeks={weeks}
                row={row}
                label={name}
                changeLabel={changeLabel}
                onOpen={() => {
                  onOpenPlayers({ faction: row.faction });
                }}
              />
            </Card>
            {open && (
              <div className={classes.nested} data-dense>
                {sortArchetypes(row.archetypes).map((archetype) => {
                  const label = archetypeName(archetype.detachments);
                  const small = archetype.players < minPlayers;
                  return (
                    <Card
                      dense
                      key={`${key}:${label}`}
                      data={{ dimmed: small }}
                      className={classes.card}
                    >
                      <div className={classes.name}>
                        <div>
                          <Text size="sm" c="dimmed">
                            {label}
                          </Text>
                          <DispositionBreakdown archetype={archetype} />
                        </div>
                      </div>
                      <Figures
                        weeks={weeks}
                        row={archetype}
                        label={`${name} · ${label}`}
                        changeLabel={changeLabel}
                        onOpen={() => {
                          onOpenPlayers({
                            faction: row.faction,
                            detachments: archetype.detachments,
                          });
                        }}
                      />
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
