import type { EventDetail, EventPlayer } from '@bcp/shared';
import { Badge, Group, Select, Stack, TextInput, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from 'mantine-datatable';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { EventQueueLine } from './EventQueueLine';
import { playersQuery } from './event-queries';
import { ExportMenu } from './ExportMenu';
import { FetchListsMenu } from './FetchListsMenu';
import { ListDrawer } from './ListDrawer';
import { ListStatusBadge } from './ListStatusBadge';
import classes from './PlayersPanel.module.css';
import { factionsOf, filterPlayers, formatRecord, lossLabel, lossOptions } from './players-filter';

function emptyText(loadingFromBcp: boolean, playerCount: number): string {
  if (loadingFromBcp) return 'Loading players from BCP…';
  if (playerCount === 0) return 'No players loaded yet. Use "Refresh from BCP".';
  return 'No players match the filter.';
}

interface PlayersPanelProps {
  event: EventDetail;
  /** True while a first-ever event sync is loading the players. */
  loadingFromBcp: boolean;
}

export function PlayersPanel({ event, loadingFromBcp }: PlayersPanelProps) {
  const players = useQuery(playersQuery(event.bcpId));
  const [query, setQuery] = useState('');
  const [faction, setFaction] = useState<string | null>(null);
  const [maxLosses, setMaxLosses] = useState<number | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const all = players.data?.items ?? [];
  const openPlayer = all.find((p) => p.bcpId === openPlayerId) ?? null;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap">
          <TextInput
            aria-label="Search players"
            placeholder="Search player or team"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
            }}
            w={240}
          />
          <Select
            aria-label="Faction"
            placeholder="All factions"
            data={factionsOf(all)}
            value={faction}
            onChange={setFaction}
            clearable
            searchable
            w={220}
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
            w={180}
          />
        </Group>
        <Group gap="sm" align="flex-start">
          <FetchListsMenu event={event} players={all} />
          <ExportMenu event={event} />
        </Group>
      </Group>

      <EventQueueLine event={event} />

      {players.error ? (
        <ErrorState error={players.error} onRetry={() => void players.refetch()} />
      ) : (
        <Panel p={0}>
          <DataTable<EventPlayer>
            records={filterPlayers(all, { query, faction, maxLosses })}
            idAccessor="bcpId"
            fetching={players.isFetching || loadingFromBcp}
            minHeight={220}
            highlightOnHover
            noRecordsText={emptyText(loadingFromBcp, all.length)}
            onRowClick={({ record }) => {
              setOpenPlayerId(record.bcpId);
            }}
            columns={[
              {
                accessor: 'placing',
                title: '#',
                width: 56,
                textAlign: 'right',
                render: (p) => <span className="numeric">{p.placing ?? '—'}</span>,
              },
              {
                accessor: 'name',
                title: 'Player',
                render: (p) => (
                  <Group gap="xs" wrap="nowrap">
                    <UnstyledButton
                      className={classes.playerName}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenPlayerId(p.bcpId);
                      }}
                    >
                      {p.name}
                    </UnstyledButton>
                    {p.dropped && (
                      <Badge size="xs" color="gray" variant="outline">
                        Dropped
                      </Badge>
                    )}
                  </Group>
                ),
              },
              {
                accessor: 'teamName',
                title: 'Team',
                hidden: !event.isTeamEvent,
                render: (p) => p.teamName ?? '—',
              },
              { accessor: 'faction', title: 'Faction', render: (p) => p.faction ?? '—' },
              {
                accessor: 'wins',
                title: 'W-L-D',
                textAlign: 'right',
                render: (p) => <span className="numeric">{formatRecord(p)}</span>,
              },
              {
                accessor: 'listStatus',
                title: 'List',
                render: (p) => <ListStatusBadge status={p.listStatus} error={p.listError} />,
              },
            ]}
          />
        </Panel>
      )}

      <ListDrawer
        eventId={event.bcpId}
        player={openPlayer}
        onClose={() => {
          setOpenPlayerId(null);
        }}
      />
    </Stack>
  );
}
