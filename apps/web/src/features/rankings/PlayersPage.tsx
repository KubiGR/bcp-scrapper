import type { RankedPlayerRow } from '@bcp/shared';
import {
  Box,
  Button,
  Group,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { ordinal, plural } from '../../lib/format';
import { SortableTh, useTableSort, type SortValue } from '../../lib/table-sort';
import { rankingsQuery } from './rankings-queries';

/** The Players page's URL search. */
export interface PlayersSearch {
  q?: string;
  faction?: string;
}

interface PlayersPageProps {
  search: PlayersSearch;
  onSearchChange: (next: PlayersSearch) => void;
}

const PAGE = 100;

type Column = 'rank' | 'name' | 'points' | 'results';
const VALUES: Record<Column, SortValue<RankedPlayerRow>> = {
  rank: (row) => row.rank,
  name: (row) => row.name,
  points: (row) => row.points,
  results: (row) => row.results,
};

/** "1st of 96 · London GT"; team events "2nd of 20 teams · …". */
export const bestResult = (best: RankedPlayerRow['best']) =>
  `${ordinal(best.placing)} of ${String(best.field)}${best.isTeamEvent ? ' teams' : ''} · ${best.eventName}`;

function PlayersTable({ rows }: { rows: RankedPlayerRow[] }) {
  const { sorted, sort, toggle } = useTableSort<RankedPlayerRow, Column>(rows, VALUES, null, {
    rank: 'asc',
  });
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table aria-label="Players" striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <SortableTh column="rank" sort={sort} onSort={toggle} ta="right">
              #
            </SortableTh>
            <SortableTh column="name" sort={sort} onSort={toggle}>
              Player
            </SortableTh>
            <SortableTh column="points" sort={sort} onSort={toggle} ta="right">
              Points
            </SortableTh>
            <SortableTh column="results" sort={sort} onSort={toggle} ta="right">
              Events
            </SortableTh>
            <Table.Th>Best result</Table.Th>
            <Table.Th>Factions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((row) => (
            <Table.Tr key={row.userId}>
              <Table.Td ta="right" className="numeric">
                {row.rank}
              </Table.Td>
              <Table.Td>
                <AnchorLink to="/players/$userId" params={{ userId: row.userId }}>
                  {row.name}
                </AnchorLink>
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {row.points.toFixed(1)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {`${String(row.counted)} of ${String(row.results)}`}
              </Table.Td>
              <Table.Td>
                <Text size="sm">{bestResult(row.best)}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {row.factions.join(', ')}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Players ranked by tournament points: their 5 best results of the last 12 months. */
export function PlayersPage({ search, onSearchChange }: PlayersPageProps) {
  // "Show more" starts over whenever the filters change.
  const filters = `${search.q ?? ''}|${search.faction ?? ''}`;
  const [paging, setPaging] = useState({ filters, limit: PAGE });
  const limit = paging.filters === filters ? paging.limit : PAGE;
  const rankings = useQuery(rankingsQuery({ search: search.q, faction: search.faction, limit }));
  const data = rankings.data;

  return (
    <Stack gap="lg">
      <Title order={1}>Players</Title>
      <Text size="sm" c="dimmed">
        Points: the 5 best results of the last 12 months at big events. 1st place at a 100+ player
        event scores 100.
      </Text>
      <Group gap="md" align="flex-end" wrap="wrap">
        <TextInput
          label="Search players"
          placeholder="Name"
          value={search.q ?? ''}
          onChange={(e) => {
            onSearchChange({ ...search, q: e.currentTarget.value || undefined });
          }}
          w={{ base: '100%', xs: 240 }}
        />
        <Select
          label="Faction"
          placeholder="Any"
          clearable
          searchable
          data={data?.factionOptions ?? []}
          value={search.faction ?? null}
          onChange={(value) => {
            onSearchChange({ ...search, faction: value ?? undefined });
          }}
          w={{ base: '100%', xs: 240 }}
        />
      </Group>

      {rankings.isPending && <Skeleton height={240} />}
      {rankings.error && (
        <ErrorState error={rankings.error} onRetry={() => void rankings.refetch()} />
      )}
      {data &&
        (data.ranked === 0 ? (
          <Text size="sm" c="dimmed">
            No ranked players yet: rankings need finished big events of the last 12 months.
          </Text>
        ) : (
          <Box style={{ opacity: rankings.isPlaceholderData ? 0.6 : 1 }}>
            <Panel title={`${plural(data.total, 'player')} of ${String(data.ranked)} ranked`}>
              {data.players.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No ranked player matches.
                </Text>
              ) : (
                <Stack gap="sm">
                  <PlayersTable rows={data.players} />
                  {data.players.length < data.total && (
                    <Group justify="center">
                      <Button
                        variant="light"
                        loading={rankings.isFetching}
                        onClick={() => {
                          setPaging({ filters, limit: limit + PAGE });
                        }}
                      >
                        Show more
                      </Button>
                    </Group>
                  )}
                </Stack>
              )}
            </Panel>
          </Box>
        ))}
    </Stack>
  );
}
