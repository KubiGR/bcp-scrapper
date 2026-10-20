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
import type { MantineTheme } from '@mantine/core';
import { DataTable, type DataTableColumn } from 'mantine-datatable';
import { useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { DispositionText } from '../../components/DispositionText';
import { ErrorState } from '../../components/ErrorState';
import { FactionText } from '../../components/FactionText';
import { FilterToggle } from '../../components/FilterToggle';
import { Panel } from '../../components/Panel';
import { useTableSort, type SortValue } from '../../lib/table-sort';
import { EventQueueLine } from './EventQueueLine';
import { playersQuery } from './event-queries';
import { ExportMenu } from './ExportMenu';
import { FetchListsMenu } from './FetchListsMenu';
import { listPath, openHere } from '../../lib/open-link';
import { ListDrawer } from './ListDrawer';
import { ListStatusBadge } from './ListStatusBadge';
import classes from './PlayersPanel.module.css';
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
} from './players-filter';
import { useQueueLists } from './use-queue-lists';
import { RankBadge } from '../rankings/RankBadge';
import { HoverHint } from '../../components/HoverHint';
import { renderFactionOption, renderFactionPill } from '../../components/FactionIcon';

function emptyText(loadingFromBcp: boolean, playerCount: number): string {
  if (loadingFromBcp) return 'Loading players from BCP…';
  if (playerCount === 0) return 'No players loaded yet. Use "Refresh from BCP".';
  return 'No players match the filter.';
}

interface PlayerColumnsOptions {
  /** The event, for each list's own address. */
  eventId: string;
  showTeam: boolean;
  onOpen: (bcpId: string) => void;
}

/** From tablet width up these get their own columns; on phones, a line under the player's name. */
const wide = (theme: MantineTheme) => `(min-width: ${theme.breakpoints.sm})`;

/** The phone line: team (when shown), faction, detachments and record. */
function PhoneLine({ player, showTeam }: { player: EventPlayer; showTeam: boolean }) {
  const detachments = player.detachments.length > 0 ? player.detachments.join(' + ') : null;
  const rest = [detachments, formatRecord(player)].filter((part) => part !== null);
  return (
    <Text size="xs" c="dimmed" hiddenFrom="sm">
      {showTeam && player.teamName !== null && `${player.teamName} · `}
      {player.faction !== null && (
        <>
          <FactionText faction={player.faction} guessed={player.factionGuessed} />
          {' · '}
        </>
      )}
      {rest.join(' · ')}
    </Text>
  );
}

type Draw = 'tough' | 'easy' | 'even';
/** Tough at or above `high`, easy at or below `low`. */
const drawOf = (value: number, low: number, high: number): Draw =>
  value >= high ? 'tough' : value <= low ? 'easy' : 'even';

/** An opponent-strength figure: bold orange for a tough draw, dimmed for an easy one. */
function DrawText({ draw, children }: { draw: Draw; children: string }) {
  return (
    <Text
      component="span"
      size="sm"
      className="numeric"
      data-draw={draw}
      fw={draw === 'tough' ? 700 : undefined}
      c={draw === 'tough' ? 'orange.4' : draw === 'easy' ? 'dimmed' : undefined}
    >
      {children}
    </Text>
  );
}

function playerColumns({
  eventId,
  showTeam,
  onOpen,
}: PlayerColumnsOptions): DataTableColumn<EventPlayer>[] {
  return [
    {
      accessor: 'placing',
      sortable: true,
      title: '#',
      width: 56,
      textAlign: 'right',
      render: (p) => <span className="numeric">{p.placing ?? '—'}</span>,
    },
    {
      accessor: 'name',
      sortable: true,
      title: 'Player',
      render: (p) => (
        <>
          <Group gap="xs" wrap="nowrap">
            <UnstyledButton
              component="a"
              href={listPath(eventId, p.bcpId)}
              className={classes.playerName}
              onClick={openHere(() => {
                onOpen(p.bcpId);
              })}
            >
              {p.name}
            </UnstyledButton>
            <RankBadge userId={p.bcpUserId} />
            {p.dropped && (
              <Badge size="xs" color="gray" variant="outline">
                Dropped
              </Badge>
            )}
          </Group>
          <PhoneLine player={p} showTeam={showTeam} />
        </>
      ),
    },
    {
      accessor: 'teamName',
      sortable: true,
      visibleMediaQuery: wide,
      title: 'Team',
      hidden: !showTeam,
      render: (p) => p.teamName ?? '—',
    },
    {
      accessor: 'faction',
      sortable: true,
      visibleMediaQuery: wide,
      title: 'Faction',
      noWrap: true,
      render: (p) =>
        p.faction === null ? '—' : <FactionText faction={p.faction} guessed={p.factionGuessed} />,
    },
    {
      accessor: 'detachments',
      sortable: true,
      visibleMediaQuery: wide,
      title: 'Detachment',
      render: (p) => (p.detachments.length > 0 ? p.detachments.join(' + ') : '—'),
    },
    {
      accessor: 'disposition',
      sortable: true,
      visibleMediaQuery: wide,
      title: 'Disposition',
      render: (p) => (p.disposition ? <DispositionText disposition={p.disposition} /> : '—'),
    },
    {
      accessor: 'wins',
      sortable: true,
      visibleMediaQuery: wide,
      title: 'W-L-D',
      textAlign: 'right',
      render: (p) => <span className="numeric">{formatRecord(p)}</span>,
    },
    {
      accessor: 'oppWinRate',
      sortable: true,
      visibleMediaQuery: wide,
      title: 'Opp. win %',
      textAlign: 'right',
      render: (p) => {
        const rate = p.opponents?.winRate ?? null;
        return rate === null ? (
          '—'
        ) : (
          <HoverHint
            hint={`How their ${String(p.opponents?.games ?? 0)} opponents did at this event (a draw is half)`}
          >
            <DrawText
              draw={drawOf(rate, 0.4, 0.6)}
            >{`${String(Math.round(rate * 100))}%`}</DrawText>
          </HoverHint>
        );
      },
    },
    {
      accessor: 'oppElo',
      sortable: true,
      visibleMediaQuery: wide,
      title: 'Opp. Elo',
      textAlign: 'right',
      render: (p) => {
        const strength = p.opponents;
        return strength?.elo === null || strength?.elo === undefined ? (
          '—'
        ) : (
          <HoverHint
            hint={`Average wh40k-elo of the ${String(strength.rated)} of ${String(strength.games)} opponents rated`}
          >
            <DrawText draw={drawOf(strength.elo, 1500, 1650)}>{String(strength.elo)}</DrawText>
          </HoverHint>
        );
      },
    },
    {
      accessor: 'listStatus',
      sortable: true,
      title: 'List',
      noWrap: true,
      render: (p) => <ListStatusBadge status={p.listStatus} error={p.listError} />,
    },
  ];
}

/** How each column sorts; the record like standings: most wins, then draws, then fewest losses. */
const PLAYER_SORT = {
  placing: (p) => p.placing,
  name: (p) => p.name,
  teamName: (p) => p.teamName,
  faction: (p) => p.faction,
  detachments: (p) => (p.detachments.length > 0 ? p.detachments.join(' + ') : null),
  disposition: (p) => p.disposition,
  // No games is no record: blank, so last either way.
  wins: (p) =>
    p.wins + p.losses + p.draws === 0 ? null : p.wins * 1_000_000 + p.draws * 1_000 - p.losses,
  oppWinRate: (p) => p.opponents?.winRate ?? null,
  oppElo: (p) => p.opponents?.elo ?? null,
  listStatus: (p) => p.listStatus,
} satisfies Record<string, SortValue<EventPlayer>>;
type PlayerSortKey = keyof typeof PLAYER_SORT;
const isPlayerSortKey = (key: string): key is PlayerSortKey => key in PLAYER_SORT;
const BY_PLACING = { key: 'placing', dir: 'asc' } as const;

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
  const [query, setQuery] = useState('');
  const [factions, setFactions] = useState<string[]>([]);
  const [dispositions, setDispositions] = useState<string[]>([]);
  const [detachments, setDetachments] = useState<string[]>([]);
  const [maxLosses, setMaxLosses] = useState<number | null>(null);
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
  const openPlayer = all.find((p) => p.bcpId === openPlayerId) ?? null;
  // The list the address opened the page on (a link opened in a new tab).
  const [listFromAddress] = useState(openPlayerIdProp ?? null);
  const filtered = filterPlayers(all, { query, factions, dispositions, detachments, maxLosses });
  // Sorted before grouping, so a team event sorts the players within each team.
  const { sorted, sort, toggle } = useTableSort<EventPlayer, PlayerSortKey>(
    filtered,
    PLAYER_SORT,
    BY_PLACING,
    {
      placing: 'asc',
    },
  );
  const current = sort ?? BY_PLACING;
  const sortProps = {
    sortStatus: { columnAccessor: current.key, direction: current.dir },
    onSortStatusChange: ({ columnAccessor }: { columnAccessor: string | number | symbol }) => {
      if (typeof columnAccessor === 'string' && isPlayerSortKey(columnAccessor)) {
        toggle(columnAccessor);
      }
    },
  };

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

  const grouped = event.isTeamEvent;
  const groups = grouped ? groupPlayersByTeam(sorted).filter((g) => g.players.length > 0) : [];

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <FilterToggle
          active={
            [query !== '', factions.length > 0, dispositions.length > 0, detachments.length > 0]
              .concat(maxLosses !== null)
              .filter(Boolean).length
          }
        >
          <Group gap="sm" wrap="wrap">
            <TextInput
              aria-label="Search players"
              placeholder="Search player or team"
              value={query}
              onChange={(e) => {
                setQuery(e.currentTarget.value);
              }}
              w={{ base: '100%', xs: 240 }}
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
              searchable
              w={{ base: '100%', xs: 240 }}
            />
            <MultiSelect
              aria-label="Disposition"
              placeholder={dispositions.length === 0 ? 'All dispositions' : undefined}
              data={dispositionsOf(all)}
              value={dispositions}
              onChange={setDispositions}
              renderOption={({ option }) => <DispositionText disposition={option.value} />}
              clearable
              w={{ base: '100%', xs: 240 }}
            />
            <MultiSelect
              aria-label="Detachment"
              placeholder={detachments.length === 0 ? 'All detachments' : undefined}
              data={detachmentsOf(all)}
              value={detachments}
              onChange={setDetachments}
              clearable
              searchable
              w={{ base: '100%', xs: 240 }}
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
              w={{ base: '100%', xs: 180 }}
            />
          </Group>
        </FilterToggle>
        <Group gap="sm" align="flex-start">
          <FetchListsMenu event={event} players={all} selectedTeamIds={[...selectedTeams]} />
          <ExportMenu event={event} />
        </Group>
      </Group>

      <EventQueueLine event={event} />

      {players.error ? (
        <ErrorState error={players.error} onRetry={() => void players.refetch()} />
      ) : grouped && groups.length === 0 ? (
        <Panel p={0}>
          <DataTable<EventPlayer>
            {...sortProps}
            records={[]}
            idAccessor="bcpId"
            fetching={players.isFetching || loadingFromBcp}
            minHeight={220}
            noRecordsText={emptyText(loadingFromBcp, all.length)}
            columns={playerColumns({
              eventId: event.bcpId,
              showTeam: false,
              onOpen: setOpenPlayerId,
            })}
          />
        </Panel>
      ) : grouped ? (
        <Stack gap="sm">
          {groups.map((group) => {
            const key = group.teamId ?? 'none';
            const expanded = !collapsed.has(key);
            return (
              <Panel key={key} p={0}>
                <Group wrap="nowrap" gap={0}>
                  {group.teamId !== null && (
                    <Checkbox
                      pl="sm"
                      aria-label={`Select ${group.teamName}`}
                      checked={selectedTeams.has(group.teamId)}
                      onChange={() => {
                        if (group.teamId !== null) toggleTeam(group.teamId);
                      }}
                    />
                  )}
                  <UnstyledButton
                    aria-expanded={expanded}
                    onClick={() => {
                      toggleGroup(key);
                    }}
                    p="sm"
                    style={{ flex: 1 }}
                  >
                    <Group justify="space-between">
                      <Text fw={600}>
                        {group.teamId !== null && (
                          <>
                            <span className="numeric">
                              {group.teamPlacing !== null ? `#${group.teamPlacing}` : '—'}
                            </span>{' '}
                          </>
                        )}
                        {group.teamName}
                      </Text>
                      <span className="numeric">{group.players.length}</span>
                    </Group>
                  </UnstyledButton>
                  {group.teamId !== null && (
                    <Group px="sm" gap="sm" wrap="nowrap">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        aria-label={`Fetch ${group.teamName} lists`}
                        disabled={missingListCountFor(all, new Set([group.teamId])) === 0}
                        loading={
                          queueTeam.isPending && queueTeam.variables.teamIds?.[0] === group.teamId
                        }
                        onClick={() => {
                          if (group.teamId !== null) queueTeam.mutate({ teamIds: [group.teamId] });
                        }}
                      >
                        Fetch team lists
                      </Button>
                      <AnchorLink
                        to="/events/$eventId/teams/$teamId"
                        params={{ eventId: event.bcpId, teamId: group.teamId }}
                        aria-label={`${group.teamName} team page`}
                      >
                        <Text size="sm">Team page</Text>
                      </AnchorLink>
                    </Group>
                  )}
                </Group>
                <Collapse expanded={expanded}>
                  <DataTable<EventPlayer>
                    {...sortProps}
                    {...sortProps}
                    records={group.players}
                    idAccessor="bcpId"
                    fetching={players.isFetching || loadingFromBcp}
                    minHeight={120}
                    highlightOnHover
                    noRecordsText={emptyText(loadingFromBcp, all.length)}
                    onRowClick={({ record }) => {
                      setOpenPlayerId(record.bcpId);
                    }}
                    columns={playerColumns({
                      eventId: event.bcpId,
                      showTeam: false,
                      onOpen: setOpenPlayerId,
                    })}
                  />
                </Collapse>
              </Panel>
            );
          })}
        </Stack>
      ) : (
        <Panel p={0}>
          <DataTable<EventPlayer>
            {...sortProps}
            records={sorted}
            idAccessor="bcpId"
            fetching={players.isFetching || loadingFromBcp}
            minHeight={220}
            highlightOnHover
            noRecordsText={emptyText(loadingFromBcp, all.length)}
            onRowClick={({ record }) => {
              setOpenPlayerId(record.bcpId);
            }}
            columns={playerColumns({
              eventId: event.bcpId,
              showTeam: event.isTeamEvent,
              onOpen: setOpenPlayerId,
            })}
          />
        </Panel>
      )}

      <ListDrawer
        eventId={event.bcpId}
        player={openPlayer}
        instant={openPlayerId !== null && openPlayerId === listFromAddress}
        onClose={() => {
          setOpenPlayerId(null);
        }}
      />
    </Stack>
  );
}
