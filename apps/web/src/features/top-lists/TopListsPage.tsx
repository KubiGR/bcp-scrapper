import { DETACHMENT_SEPARATOR, KNOWN_DISPOSITIONS, type PlayerSearchResponse } from '@bcp/shared';
import {
  Alert,
  Box,
  Button,
  MultiSelect,
  Select,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { EventHeat, NewLeaf, playedLately } from '../../components/EventSymbols';
import { DispositionText } from '../../components/DispositionText';
import { ErrorState } from '../../components/ErrorState';
import { FieldElo } from '../../components/FieldElo';
import { FilterToggle } from '../../components/FilterToggle';
import { Panel } from '../../components/Panel';
import { PlayerLine } from '../../components/PlayerLine';
import { formatIsoDay, plural } from '../../lib/format';
import { listPath, openHere } from '../../lib/open-link';
import { sortRows, type SortDir } from '../../lib/table-sort';
import { useDraftRange } from '../../lib/use-draft-range';
import { ListDrawer } from '../event/ListDrawer';
import { formatRecord, lossLabel } from '../event/players-filter';
import { FOUND_PLAYER_SORT, placingLine } from './player-sort';
import classes from './TopListsPage.module.css';
import { useDateWindow } from '../updates/updates-queries';
import { topListsQuery, type TopListsSearch } from './top-lists-queries';
import { PlayerName } from '../rankings/PlayerName';
import { RankBadge } from '../rankings/RankBadge';
import { UpdatePicker } from '../updates/UpdatePicker';
import { renderFactionOption, renderFactionPill } from '../../components/FactionIcon';

const LOSS_CHOICES = [0, 1, 2, 3, 4, 5];
/** 1 is any big event; the default 4 keeps X-1 at 3-1 or better. */
const ROUND_CHOICES = [1, 3, 4, 5, 6, 7, 8];
const DEFAULT_MIN_ROUNDS = 4;
const roundsLabel = (rounds: number) => (rounds === 1 ? 'Any' : `${rounds}+ rounds`);

type SortKey = keyof typeof FOUND_PLAYER_SORT;
/** The orders on offer, each its natural way round. Best record groups the players by record. */
const SORTS: { value: SortKey; label: string; dir: SortDir }[] = [
  { value: 'record', label: 'Best record', dir: 'desc' },
  { value: 'event', label: 'Newest event', dir: 'desc' },
  { value: 'player', label: 'Player', dir: 'asc' },
  { value: 'army', label: 'Army', dir: 'asc' },
];

const split = (value: string | undefined, separator = ',') =>
  value?.split(separator).filter(Boolean) ?? [];
const join = (values: string[], separator = ',') =>
  values.length === 0 ? undefined : values.join(separator);
const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

type FoundPlayer = PlayerSearchResponse['players'][number];

/** A record group's heading after the record: "Undefeated · 1 player", "One loss, 2 draws · 6 players". */
export function recordGroupLabel(record: { losses: number; draws: number }, players: number) {
  const losses =
    record.losses === 0
      ? 'Undefeated'
      : record.losses === 1
        ? 'One loss'
        : `${String(record.losses)} losses`;
  const draws = record.draws === 0 ? '' : `, ${plural(record.draws, 'draw')}`;
  return `${losses}${draws} · ${plural(players, 'player')}`;
}

/** Players in order, cut into runs of the same record. */
function byRecord(players: FoundPlayer[]): FoundPlayer[][] {
  const groups: FoundPlayer[][] = [];
  for (const player of players) {
    const last = groups.at(-1);
    if (last?.[0] !== undefined && formatRecord(last[0]) === formatRecord(player)) {
      last.push(player);
    } else {
      groups.push([player]);
    }
  }
  return groups;
}

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
  const dir = SORTS.find((option) => option.value === sortKey)?.dir ?? 'desc';
  // Stable, so the same record keeps the API's order: higher Elo first.
  const sorted = sortRows(found, FOUND_PLAYER_SORT[sortKey], dir);
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
    <div className={classes.layout}>
      <Box component="aside" aria-label="Filters" className={classes.sidebar}>
        <FilterToggle
          active={
            [factions, dispositions, detachments].filter((chosen) => chosen.length > 0).length
          }
        >
          <Panel title="Filters">
            <Stack gap="md">
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
      </Box>

      <Stack gap="lg" className={classes.main}>
        <div className={classes.heading}>
          <div>
            <Title order={1}>Top lists</Title>
            {results.data && (
              <Text c="dimmed" mt={4}>
                {plural(found.length, 'player')}
                {results.data.truncated ? '+' : ''} at {lossLabel(maxLosses)}
                {factions.length > 0 ? `, ${factions.join(', ')}` : ''}
              </Text>
            )}
          </div>
          <Select
            label="Sort by"
            data={SORTS.map(({ value, label }) => ({ value, label }))}
            value={sortKey}
            onChange={(value) => {
              const next = SORTS.find((option) => option.value === value);
              if (next) setSortKey(next.value);
            }}
            allowDeselect={false}
            w={170}
          />
        </div>

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
              ) : sortKey === 'record' ? (
                byRecord(sorted).map((group) => {
                  const [first] = group;
                  if (first === undefined) return null;
                  const record = formatRecord(first);
                  return (
                    <section key={record} className={classes.group} aria-label={record}>
                      <h2 className={classes.groupHeading}>
                        <span className={classes.groupRecord}>{record}</span>
                        <span className={classes.groupLabel}>
                          {recordGroupLabel(first, group.length)}
                        </span>
                      </h2>
                      {group.map((player) => (
                        <ResultCard
                          key={`${player.eventId}:${player.bcpId}`}
                          player={player}
                          onOpen={openPlayer}
                        />
                      ))}
                    </section>
                  );
                })
              ) : (
                <div className={classes.group}>
                  {sorted.map((player) => (
                    <ResultCard
                      key={`${player.eventId}:${player.bcpId}`}
                      player={player}
                      showRecord
                      onOpen={openPlayer}
                    />
                  ))}
                </div>
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
    </div>
  );
}

interface ResultCardProps {
  player: FoundPlayer;
  /** The record on the card itself, when there's no record heading above it. */
  showRecord?: boolean;
  onOpen: (player: FoundPlayer) => void;
}

/** One player's result: who, where, what they brought, and their list; a click opens the list. */
function ResultCard({ player, showRecord = false, onOpen }: ResultCardProps) {
  const placing = placingLine(player);
  return (
    <article
      className={classes.card}
      onClick={(e) => {
        // Links and buttons on the card do their own thing.
        if (e.target instanceof Element && e.target.closest('a, button')) return;
        onOpen(player);
      }}
    >
      {showRecord && <span className={classes.cardRecord}>{formatRecord(player)}</span>}
      <div className={classes.cardPlayer}>
        <Text fw={600}>
          <PlayerName name={player.name} userId={player.bcpUserId} />
        </Text>
        <Text size="sm" c="dimmed" className={classes.badges}>
          <RankBadge userId={player.bcpUserId} />
        </Text>
      </div>
      <div className={classes.cardEvent}>
        <Text>
          <AnchorLink
            to="/events/$eventId"
            params={{ eventId: player.eventId }}
            search={{ tab: 'players' }}
          >
            {player.eventName}
          </AnchorLink>
          {playedLately(player.eventStartDate) && <NewLeaf />}
        </Text>
        <Text size="xs" c="dimmed" className="numeric">
          {placing !== null && (
            <>
              <span className={classes.placing}>{placing}</span>
              {' · '}
            </>
          )}
          <span className={classes.piece}>{formatIsoDay(player.eventStartDate.slice(0, 10))}</span>{' '}
          ·{' '}
          <span className={classes.piece}>
            {plural(player.eventPlayerCount, 'player')}
            {player.eventTeamCount !== null && ` · ${plural(player.eventTeamCount, 'team')}`}
            <EventHeat playerCount={player.eventPlayerCount} />
          </span>
          {player.eventFieldElo !== null && (
            <>
              {' · '}
              <span className={classes.piece}>
                <FieldElo elo={player.eventFieldElo} />
              </span>
            </>
          )}
        </Text>
      </div>
      <Text size="sm" className={classes.cardArmy}>
        <PlayerLine {...player} />
      </Text>
      <Button
        component="a"
        href={listPath(player.eventId, player.bcpId)}
        variant="light"
        className={classes.cardList}
        onClick={openHere(() => {
          onOpen(player);
        })}
      >
        List
      </Button>
    </article>
  );
}
