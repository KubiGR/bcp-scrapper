import type { EventDetail, EventPlayer } from '@bcp/shared';
import {
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useUncontrolled } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { DispositionText } from '../../components/DispositionText';
import { ErrorState } from '../../components/ErrorState';
import { FactionText } from '../../components/FactionText';
import { FilterToggle } from '../../components/FilterToggle';
import { HoverHint } from '../../components/HoverHint';
import { Panel } from '../../components/Panel';
import { Card, CardGroup, SidebarLayout, scoreboardClasses } from '../../components/Scoreboard';
import { renderFactionOption, renderFactionPill } from '../../components/FactionIcon';
import { listPath, openHere } from '../../lib/open-link';
import { sortRows, type SortDir, type SortValue } from '../../lib/table-sort';
import { PlayerName } from '../rankings/PlayerName';
import { RankBadge } from '../rankings/RankBadge';
import { topRanksQuery } from '../rankings/rankings-queries';
import { EventQueueLine } from './EventQueueLine';
import { playersQuery } from './event-queries';
import { ExportMenu } from './ExportMenu';
import { FetchListsMenu } from './FetchListsMenu';
import { ListDrawer } from './ListDrawer';
import { ListStatusBadge } from './ListStatusBadge';
import {
  detachmentsOf,
  dispositionsOf,
  factionsOf,
  filterPlayers,
  formatRecord,
  groupPlayersByTeam,
  lossLabel,
  lossOptions,
  missingListCountFor,
  type PlayerGroup,
} from './players-filter';
import classes from './PlayersPanel.module.css';
import { useQueueLists } from './use-queue-lists';
import { useTypeToSearch } from '../../lib/use-type-to-search';
import { CardsSkeleton } from '../../components/Skeletons';

function emptyText(loadingFromBcp: boolean, playerCount: number): string {
  if (loadingFromBcp) return 'Loading players from BCP…';
  if (playerCount === 0) return 'No players loaded yet. Use "Refresh from BCP".';
  return 'No players match the filter.';
}

type Draw = 'tough-1' | 'tough-2' | 'tough-3' | 'easy' | 'even';
/** Tough in three steps (at or above each of `steps`, ascending), easy at or below `easy`. */
const drawOf = (value: number, easy: number, steps: [number, number, number]): Draw => {
  const level = steps.filter((step) => value >= step).length;
  if (level > 0) return `tough-${String(level)}` as Draw;
  return value <= easy ? 'easy' : 'even';
};
/** Hotter for tougher: yellow, orange, red. */
const DRAW_COLOR: Record<Draw, string | undefined> = {
  'tough-1': 'yellow.4',
  'tough-2': 'orange.5',
  'tough-3': 'red.5',
  easy: 'dimmed',
  even: undefined,
};

/** An opponent-strength figure: yellow, orange or red as the draw gets tougher; easy dimmed. */
function DrawText({ draw, children }: { draw: Draw; children: string }) {
  return (
    <Text
      component="span"
      className="numeric"
      data-draw={draw}
      fw={draw.startsWith('tough') ? 700 : 600}
      c={DRAW_COLOR[draw]}
    >
      {children}
    </Text>
  );
}

/** How each order sorts; the record like standings: most wins, then draws, then fewest losses. */
const PLAYER_SORT = {
  placing: (p) => p.placing,
  name: (p) => p.name,
  faction: (p) => p.faction,
  // No games is no record: blank, so last either way.
  wins: (p) =>
    p.wins + p.losses + p.draws === 0 ? null : p.wins * 1_000_000 + p.draws * 1_000 - p.losses,
  oppWinRate: (p) => p.opponents?.winRate ?? null,
  oppElo: (p) => p.opponents?.elo ?? null,
  listStatus: (p) => p.listStatus,
} satisfies Record<string, SortValue<EventPlayer>>;
type PlayerSortKey = keyof typeof PLAYER_SORT | 'elo';

/** The orders on offer, each its natural way round. */
const SORTS: { value: PlayerSortKey; label: string; dir: SortDir }[] = [
  { value: 'placing', label: 'Placing', dir: 'asc' },
  { value: 'wins', label: 'Record', dir: 'desc' },
  { value: 'elo', label: 'Elo', dir: 'desc' },
  { value: 'name', label: 'Player', dir: 'asc' },
  { value: 'faction', label: 'Faction', dir: 'asc' },
  { value: 'oppWinRate', label: 'Opp. win %', dir: 'desc' },
  { value: 'oppElo', label: 'Opp. Elo', dir: 'desc' },
  { value: 'listStatus', label: 'List', dir: 'asc' },
];

/** "Undefeated", "One loss", "3 losses", with draws: what a record group's heading says. */
function recordMeaning(player: EventPlayer, count: number): string {
  const played = player.wins + player.losses + player.draws;
  const players = `${String(count)} ${count === 1 ? 'player' : 'players'}`;
  if (played === 0) return players;
  const losses =
    player.losses === 0
      ? 'Undefeated'
      : player.losses === 1
        ? 'One loss'
        : `${String(player.losses)} losses`;
  const draws =
    player.draws === 0 ? '' : `, ${String(player.draws)} draw${player.draws === 1 ? '' : 's'}`;
  return `${losses}${draws} · ${players}`;
}

/** Players by record, best record first; each group keeps the players' order. */
function byRecord(players: EventPlayer[]): { record: string; players: EventPlayer[] }[] {
  const groups = new Map<string, EventPlayer[]>();
  const best = sortRows(players, PLAYER_SORT.wins, 'desc');
  for (const player of best) {
    const played = player.wins + player.losses + player.draws > 0;
    groups.set(played ? formatRecord(player) : 'No games', []);
  }
  for (const player of players) {
    const played = player.wins + player.losses + player.draws > 0;
    groups.get(played ? formatRecord(player) : 'No games')?.push(player);
  }
  return [...groups].map(([record, members]) => ({ record, players: members }));
}

interface PlayersPanelProps {
  event: EventDetail;
  /** True while a first-ever event sync is loading the players. */
  loadingFromBcp: boolean;
  /** The player whose list is open (from the address, so it can be shared); omitted: kept here. */
  openPlayerId?: string | null;
  onOpenPlayer?: (playerId: string | null) => void;
}

export function PlayersPanel({
  event,
  loadingFromBcp,
  openPlayerId: openPlayerIdProp,
  onOpenPlayer,
}: PlayersPanelProps) {
  const players = useQuery(playersQuery(event.bcpId));
  const typeToSearch = useTypeToSearch();
  const [query, setQuery] = useState('');
  const [factions, setFactions] = useState<string[]>([]);
  const [dispositions, setDispositions] = useState<string[]>([]);
  const [detachments, setDetachments] = useState<string[]>([]);
  const [maxLosses, setMaxLosses] = useState<number | null>(null);
  const [chosenSort, setChosenSort] = useState<PlayerSortKey | null>(null);
  const [openPlayerId, setOpenPlayerId] = useUncontrolled<string | null>({
    value: openPlayerIdProp,
    defaultValue: null,
    onChange: onOpenPlayer,
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Ticked teams, by id, so they survive the players refetching while lists arrive.
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const queueTeam = useQueueLists(event);
  const all = players.data?.items ?? [];
  const hasResults =
    event.ended ||
    all.some(
      (player) =>
        player.placing !== null ||
        PLAYER_SORT.wins(player) !== null ||
        (player.opponents?.games ?? 0) > 0,
    );
  const sortKey = chosenSort ?? (hasResults ? 'placing' : 'elo');
  const { data: ratings } = useQuery({
    ...topRanksQuery,
    enabled: sortKey === 'elo' && all.some((player) => player.bcpUserId !== null),
  });
  const openPlayer = all.find((p) => p.bcpId === openPlayerId) ?? null;
  // The list the address opened the page on (a link opened in a new tab).
  const [listFromAddress] = useState(openPlayerIdProp ?? null);
  const filtered = filterPlayers(all, { query, factions, dispositions, detachments, maxLosses });
  const dir = SORTS.find((option) => option.value === sortKey)?.dir ?? 'asc';
  const sortValue: SortValue<EventPlayer> =
    sortKey === 'elo'
      ? (player) => (player.bcpUserId === null ? null : (ratings?.elo[player.bcpUserId] ?? null))
      : PLAYER_SORT[sortKey];
  // Sorted before grouping, so a team event sorts the players within each team.
  const sorted = sortRows(filtered, sortValue, dir);

  const toggleTeam = (teamId: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };
  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const cardProps = { eventId: event.bcpId, onOpen: setOpenPlayerId };

  const content = () => {
    if (players.error) {
      return <ErrorState error={players.error} onRetry={() => void players.refetch()} />;
    }
    if (players.isPending) return <CardsSkeleton label="Loading players" cards={4} dense />;
    if (sorted.length === 0) {
      return (
        <Text c="dimmed" py="xl" ta="center">
          {emptyText(loadingFromBcp, all.length)}
        </Text>
      );
    }
    if (event.isTeamEvent) {
      return groupPlayersByTeam(sorted)
        .filter((group) => group.players.length > 0)
        .map((group) => {
          const key = group.teamId ?? 'none';
          return (
            <TeamGroup
              key={key}
              eventId={event.bcpId}
              group={group}
              expanded={!collapsed.has(key)}
              onToggle={() => {
                toggleGroup(key);
              }}
              selected={group.teamId !== null && selectedTeams.has(group.teamId)}
              onSelect={() => {
                if (group.teamId !== null) toggleTeam(group.teamId);
              }}
              canFetch={
                group.teamId !== null && missingListCountFor(all, new Set([group.teamId])) > 0
              }
              fetching={queueTeam.isPending && queueTeam.variables.teamIds?.[0] === group.teamId}
              onFetch={() => {
                if (group.teamId !== null) queueTeam.mutate({ teamIds: [group.teamId] });
              }}
            >
              {group.players.map((player) => (
                <PlayerCard key={player.bcpId} player={player} showRecord {...cardProps} />
              ))}
            </TeamGroup>
          );
        });
    }
    if (sortKey === 'placing' || sortKey === 'wins' || (sortKey === 'elo' && !hasResults)) {
      return byRecord(sorted).map(({ record, players: members }) => {
        const [first] = members;
        return (
          <CardGroup
            dense
            key={record}
            label={record}
            description={first === undefined ? undefined : recordMeaning(first, members.length)}
          >
            {members.map((player) => (
              <PlayerCard key={player.bcpId} player={player} {...cardProps} />
            ))}
          </CardGroup>
        );
      });
    }
    return (
      <div className={scoreboardClasses.group} data-dense>
        {sorted.map((player) => (
          <PlayerCard key={player.bcpId} player={player} showRecord {...cardProps} />
        ))}
      </div>
    );
  };

  return (
    <SidebarLayout
      sidebarLabel="Filters"
      sidebar={
        <>
          <FilterToggle
            active={
              [query !== '', factions.length > 0, dispositions.length > 0, detachments.length > 0]
                .concat(maxLosses !== null)
                .filter(Boolean).length
            }
          >
            <Panel title="Filters">
              <Stack gap="sm">
                <Select
                  label="Sort by"
                  data={SORTS.map(({ value, label }) => ({ value, label }))}
                  value={sortKey}
                  onChange={(value) => {
                    const next = SORTS.find((option) => option.value === value);
                    if (next) setChosenSort(next.value);
                  }}
                  allowDeselect={false}
                />
                <TextInput
                  aria-label="Search players"
                  placeholder="Search player or team"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.currentTarget.value);
                  }}
                />
                <MultiSelect
                  aria-label="Faction"
                  renderOption={renderFactionOption}
                  renderPill={renderFactionPill}
                  placeholder={factions.length === 0 ? 'All factions' : undefined}
                  data={factionsOf(all)}
                  value={factions}
                  onChange={setFactions}
                  clearable
                  searchable={typeToSearch}
                />
                <Select
                  aria-label="Record"
                  placeholder="All results"
                  data={lossOptions(event.roundCount).map((n) => ({
                    value: String(n),
                    label: lossLabel(n),
                  }))}
                  value={maxLosses === null ? null : String(maxLosses)}
                  onChange={(value) => {
                    setMaxLosses(value === null ? null : Number(value));
                  }}
                  clearable
                />
                <MultiSelect
                  aria-label="Disposition"
                  placeholder={dispositions.length === 0 ? 'All dispositions' : undefined}
                  data={dispositionsOf(all)}
                  value={dispositions}
                  onChange={setDispositions}
                  renderOption={({ option }) => <DispositionText disposition={option.value} />}
                  clearable
                />
                <MultiSelect
                  aria-label="Detachment"
                  placeholder={detachments.length === 0 ? 'All detachments' : undefined}
                  data={detachmentsOf(all, factions, detachments)}
                  value={detachments}
                  onChange={setDetachments}
                  clearable
                  searchable={typeToSearch}
                />
              </Stack>
            </Panel>
          </FilterToggle>
          <Panel title="Lists">
            <Stack gap="sm">
              <Group gap="sm">
                <FetchListsMenu event={event} players={all} selectedTeamIds={[...selectedTeams]} />
                <ExportMenu event={event} />
              </Group>
              <EventQueueLine event={event} />
            </Stack>
          </Panel>
        </>
      }
    >
      <Stack gap="lg">
        {players.data && (
          <Text c="dimmed">
            {`${String(sorted.length)} of ${String(all.length)} ${all.length === 1 ? 'player' : 'players'}`}
          </Text>
        )}
        {content()}
      </Stack>

      <ListDrawer
        eventId={event.bcpId}
        player={openPlayer}
        instant={openPlayerId !== null && openPlayerId === listFromAddress}
        onClose={() => {
          setOpenPlayerId(null);
        }}
      />
    </SidebarLayout>
  );
}

interface TeamGroupProps {
  eventId: string;
  group: PlayerGroup;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  canFetch: boolean;
  fetching: boolean;
  onFetch: () => void;
  children: ReactNode;
}

/** A team's players under its placing, name and record; ticked, collapsed or fetched as one. */
function TeamGroup({
  eventId,
  group,
  expanded,
  onToggle,
  selected,
  onSelect,
  canFetch,
  fetching,
  onFetch,
  children,
}: TeamGroupProps) {
  const record = group.teamRecord;
  const played = record !== null && record.wins + record.losses + record.draws > 0;
  return (
    <section className={scoreboardClasses.group} aria-label={group.teamName}>
      <div className={classes.teamHeading}>
        {group.teamId !== null && (
          <Checkbox
            aria-label={`Select ${group.teamName}`}
            checked={selected}
            onChange={onSelect}
          />
        )}
        <UnstyledButton aria-expanded={expanded} onClick={onToggle} className={classes.teamToggle}>
          {group.teamId !== null && (
            <>
              <span className={scoreboardClasses.groupKey}>
                {group.teamPlacing !== null ? `#${String(group.teamPlacing)}` : '—'}
              </span>{' '}
            </>
          )}
          <span className={classes.teamName}>{group.teamName}</span>
          {played && (
            <span className={`${scoreboardClasses.groupLabel} numeric`}>
              {' '}
              {formatRecord(record)}
            </span>
          )}
          <span className={scoreboardClasses.groupLabel}>
            {' · '}
            {group.players.length} {group.players.length === 1 ? 'player' : 'players'}
          </span>
        </UnstyledButton>
        {group.teamId !== null && (
          <Group gap="sm" wrap="nowrap">
            <Button
              size="compact-sm"
              variant="subtle"
              aria-label={`Fetch ${group.teamName} lists`}
              disabled={!canFetch}
              loading={fetching}
              onClick={onFetch}
            >
              Fetch team lists
            </Button>
            <AnchorLink
              to="/events/$eventId/teams/$teamId"
              params={{ eventId, teamId: group.teamId }}
              aria-label={`${group.teamName} team page`}
            >
              <Text size="sm">Team page</Text>
            </AnchorLink>
          </Group>
        )}
      </div>
      <Collapse expanded={expanded}>
        <div className={scoreboardClasses.group} data-dense>
          {children}
        </div>
      </Collapse>
    </section>
  );
}

interface PlayerCardProps {
  eventId: string;
  player: EventPlayer;
  /** The record on the card, when no record heading is above it. */
  showRecord?: boolean;
  onOpen: (bcpId: string) => void;
}

/** One player: placing, name, army, how tough their opponents were, and their list. */
function PlayerCard({ eventId, player, showRecord = false, onOpen }: PlayerCardProps) {
  const winRate = player.opponents?.winRate ?? null;
  const strength = player.opponents;
  return (
    <Card
      dense
      onOpen={() => {
        onOpen(player.bcpId);
      }}
    >
      <span className={classes.placing}>
        {player.placing === null ? '—' : `#${String(player.placing)}`}
      </span>
      <div className={classes.who}>
        <Group gap="xs" wrap="wrap">
          <Text fw={600} component="span">
            <PlayerName name={player.name} userId={player.bcpUserId} />
          </Text>
          <RankBadge userId={player.bcpUserId} />
          {player.dropped && (
            <Badge size="xs" color="gray" variant="outline">
              Dropped
            </Badge>
          )}
        </Group>
      </div>
      <div className={classes.army}>
        <Text size="sm">
          {player.faction === null ? (
            'No faction'
          ) : (
            <FactionText faction={player.faction} guessed={player.factionGuessed} />
          )}
          {player.detachments.length > 0 && ` · ${player.detachments.join(' + ')}`}
        </Text>
        {player.disposition !== null && (
          <Text size="sm" fw={600}>
            <DispositionText disposition={player.disposition} />
          </Text>
        )}
      </div>
      {showRecord && (
        <span className={classes.record}>
          {player.wins + player.losses + player.draws === 0 ? '—' : formatRecord(player)}
        </span>
      )}
      <div className={classes.opp}>
        {winRate === null ? (
          <Text component="span">—</Text>
        ) : (
          <HoverHint
            hint={`How their ${String(player.opponents?.games ?? 0)} opponents did at this event (a draw is half)`}
          >
            <DrawText
              draw={drawOf(Math.round(winRate * 100), 40, [60, 65, 70])}
            >{`${String(Math.round(winRate * 100))}%`}</DrawText>
          </HoverHint>
        )}
        <span className={scoreboardClasses.statLabel}>Opp. win %</span>
      </div>
      <div className={classes.opp}>
        {strength?.elo === null || strength?.elo === undefined ? (
          <Text component="span">—</Text>
        ) : (
          <HoverHint
            hint={`Average wh40k-elo of the ${String(strength.rated)} of ${String(strength.games)} opponents rated`}
          >
            <DrawText draw={drawOf(strength.elo, 1500, [1650, 1700, 1750])}>
              {String(strength.elo)}
            </DrawText>
          </HoverHint>
        )}
        <span className={scoreboardClasses.statLabel}>Opp. Elo</span>
      </div>
      <div className={classes.list}>
        {/* A fetched list keeps its own address, for a new tab; a plain click opens it here. */}
        {player.listStatus === 'fetched' ? (
          <a
            href={listPath(eventId, player.bcpId)}
            aria-label="Fetched"
            onClick={openHere(() => {
              onOpen(player.bcpId);
            })}
          >
            <ListStatusBadge status={player.listStatus} error={player.listError} />
          </a>
        ) : (
          <ListStatusBadge status={player.listStatus} error={player.listError} />
        )}
      </div>
    </Card>
  );
}
