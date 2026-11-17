import type { PlayerSearchResponse } from '@bcp/shared';
import { Button, Select, Text } from '@mantine/core';
import { AnchorLink } from '../../components/AnchorLink';
import { HotCount, NewLeaf, playedLately } from '../../components/EventSymbols';
import { FieldElo } from '../../components/FieldElo';
import { PlayerLine } from '../../components/PlayerLine';
import { Card, CardGroup, scoreboardClasses } from '../../components/Scoreboard';
import { formatIsoDay, plural } from '../../lib/format';
import { listPath, openHere } from '../../lib/open-link';
import { sortRows, type SortDir } from '../../lib/table-sort';
import { formatRecord } from '../event/players-filter';
import { PlayerName } from '../rankings/PlayerName';
import { RankBadge } from '../rankings/RankBadge';
import classes from './FoundPlayers.module.css';
import { FOUND_PLAYER_SORT, placingLine } from './player-sort';

/** A player found by the search (Top lists, Meta's players): one event's result. */
export type FoundPlayer = PlayerSearchResponse['players'][number];

export type SortKey = keyof typeof FOUND_PLAYER_SORT;
/** The orders on offer, each its natural way round. Best record groups the players by record. */
export const SORTS: { value: SortKey; label: string; dir: SortDir }[] = [
  { value: 'record', label: 'Best record', dir: 'desc' },
  { value: 'event', label: 'Newest event', dir: 'desc' },
  { value: 'player', label: 'Player', dir: 'asc' },
  { value: 'army', label: 'Army', dir: 'asc' },
];

/** Found players in the order picked; the same record keeps the API's order (higher Elo first). */
export const sortFound = (players: FoundPlayer[], key: SortKey): FoundPlayer[] =>
  sortRows(
    players,
    FOUND_PLAYER_SORT[key],
    SORTS.find((option) => option.value === key)?.dir ?? 'desc',
  );

/** The found players' order, for a sidebar or a drawer's top. */
export function FoundSortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
}) {
  return (
    <Select
      label="Sort by"
      data={SORTS.map(({ value: key, label }) => ({ value: key, label }))}
      value={value}
      onChange={(next) => {
        const option = SORTS.find((candidate) => candidate.value === next);
        if (option) onChange(option.value);
      }}
      allowDeselect={false}
    />
  );
}

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

/**
 * Found players as compact cards: by best record under each record's heading ("4-1-0 · One loss"),
 * otherwise one list with the record on each card.
 */
export function FoundPlayerCards({
  players,
  sortKey,
  onOpen,
}: {
  players: FoundPlayer[];
  sortKey: SortKey;
  onOpen: (player: FoundPlayer) => void;
}) {
  if (sortKey !== 'record') {
    return (
      <div className={scoreboardClasses.group} data-dense>
        {players.map((player) => (
          <ResultCard
            key={`${player.eventId}:${player.bcpId}`}
            player={player}
            showRecord
            onOpen={onOpen}
          />
        ))}
      </div>
    );
  }
  return byRecord(players).map((group) => {
    const [first] = group;
    if (first === undefined) return null;
    const record = formatRecord(first);
    return (
      <CardGroup
        dense
        key={record}
        label={record}
        description={recordGroupLabel(first, group.length)}
      >
        {group.map((player) => (
          <ResultCard key={`${player.eventId}:${player.bcpId}`} player={player} onOpen={onOpen} />
        ))}
      </CardGroup>
    );
  });
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
    <Card
      dense
      onOpen={() => {
        onOpen(player);
      }}
    >
      {showRecord && <span className={classes.cardRecord}>{formatRecord(player)}</span>}
      <div className={classes.cardPlayer}>
        <Text fw={600} size="sm">
          <PlayerName name={player.name} userId={player.bcpUserId} />
        </Text>
        <Text size="sm" c="dimmed" className={classes.badges}>
          <RankBadge userId={player.bcpUserId} />
        </Text>
      </div>
      <div className={classes.cardEvent}>
        <Text size="sm" className={classes.eventName} title={player.eventName}>
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
            <HotCount playerCount={player.eventPlayerCount} />
            {player.eventTeamCount !== null && ` · ${plural(player.eventTeamCount, 'team')}`}
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
        size="xs"
        className={classes.cardList}
        onClick={openHere(() => {
          onOpen(player);
        })}
      >
        List
      </Button>
    </Card>
  );
}
