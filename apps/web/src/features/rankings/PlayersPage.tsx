import type { EloFigure, RankedPlayerRow } from '@bcp/shared';
import {
  Box,
  Button,
  Group,
  Input,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SearchSelect } from '../../components/SearchSelect';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { FilterToggle } from '../../components/FilterToggle';
import { Panel } from '../../components/Panel';
import { PageTitle, SidebarLayout } from '../../components/Scoreboard';
import { ordinal, plural } from '../../lib/format';
import { SortableTh, useTableSort, type SortValue } from '../../lib/table-sort';
import { rankingsPagesQuery } from './rankings-queries';
import { FactionIcon, renderFactionOption } from '../../components/FactionIcon';
import { HoverHint } from '../../components/HoverHint';

/** The Players page's URL search. */
export interface PlayersSearch {
  q?: string;
  faction?: string;
  /** By Overall (60% wh40k-elo, 40% points) or wh40k-elo instead of points. */
  order?: 'overall' | 'wh40kElo';
}

interface PlayersPageProps {
  search: PlayersSearch;
  onSearchChange: (next: PlayersSearch) => void;
}

type Column = 'rank' | 'name' | 'points' | 'overall' | 'wh40kElo' | 'results';
const VALUES: Record<Column, SortValue<RankedPlayerRow>> = {
  rank: (row) => row.rank,
  name: (row) => row.name,
  points: (row) => row.points,
  overall: (row) => row.overallRank,
  wh40kElo: (row) => row.wh40kElo?.elo ?? null,
  results: (row) => row.results,
};

/** An Elo rating, its games on hover; a dash when unrated. */
export function EloCell({ figure }: { figure: EloFigure | null }) {
  if (figure === null)
    return (
      <Text span c="dimmed">
        —
      </Text>
    );
  return (
    <HoverHint hint={`${String(figure.games)} ${figure.games === 1 ? 'game' : 'games'}`}>
      {figure.elo}
    </HoverHint>
  );
}

/** "1st of 96 · London GT"; team events "2nd of 20 teams · …". */
export const bestResult = (best: RankedPlayerRow['best']) =>
  `${ordinal(best.placing)} of ${String(best.field)}${best.isTeamEvent ? ' teams' : ''} · ${best.eventName}`;

function PlayersTable({ rows }: { rows: RankedPlayerRow[] }) {
  const { sorted, sort, toggle } = useTableSort<RankedPlayerRow, Column>(rows, VALUES, null, {
    rank: 'asc',
    overall: 'asc',
  });
  return (
    <Table.ScrollContainer minWidth={780}>
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
            <SortableTh column="overall" sort={sort} onSort={toggle} ta="right">
              Overall
            </SortableTh>
            <SortableTh
              column="wh40kElo"
              sort={sort}
              onSort={toggle}
              ta="right"
              style={{ whiteSpace: 'nowrap' }}
            >
              wh40k-elo
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
                <HoverHint hint={`Score ${String(Number(row.overall.toFixed(2)))} of 100`}>
                  #{row.overallRank}
                </HoverHint>
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                <EloCell figure={row.wh40kElo} />
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
  // Each "Show more" loads the next page; new filters start from the first again.
  const rankings = useInfiniteQuery(
    rankingsPagesQuery({ search: search.q?.trim(), faction: search.faction, order: search.order }),
  );
  const first = rankings.data?.pages[0];
  const data =
    first === undefined
      ? undefined
      : { ...first, players: rankings.data?.pages.flatMap((page) => page.players) ?? [] };

  const sidebar = (
    <>
      <FilterToggle active={Number(Boolean(search.q)) + Number(Boolean(search.faction))}>
        <Panel title="Filters">
          <Stack gap="sm">
            <TextInput
              label="Search players"
              placeholder="Name"
              maxLength={100}
              value={search.q ?? ''}
              onChange={(e) => {
                onSearchChange({ ...search, q: e.currentTarget.value || undefined });
              }}
            />
            <SearchSelect
              label="Faction"
              renderOption={renderFactionOption}
              leftSection={<FactionIcon faction={search.faction ?? null} size={18} />}
              placeholder="Any"
              clearable
              data={data?.factionOptions ?? []}
              value={search.faction ?? null}
              onChange={(value) => {
                onSearchChange({ ...search, faction: value ?? undefined });
              }}
            />
            <Input.Wrapper label="Order by">
              <SegmentedControl
                fullWidth
                aria-label="Order by"
                data={[
                  { value: 'points', label: 'Points' },
                  { value: 'overall', label: 'Overall' },
                  { value: 'wh40kElo', label: 'wh40k-elo' },
                ]}
                value={search.order ?? 'points'}
                onChange={(value) => {
                  const order = value === 'overall' || value === 'wh40kElo' ? value : undefined;
                  const next: PlayersSearch = { ...search, order };
                  if (order === undefined) delete next.order;
                  onSearchChange(next);
                }}
                style={{ display: 'flex' }}
              />
            </Input.Wrapper>
          </Stack>
        </Panel>
      </FilterToggle>
      <Panel title="How points work">
        <Text size="xs" c="dimmed">
          Points: the 5 best results of the last 12 months at big events. 1st place at a 100-player
          event scores 100; bigger events score more (400 players: 200), smaller ones less (20
          players: 45). Stronger fields count more: an event whose players average 1550 wh40k-elo
          scores ×1, and every 100 above adds 50% (up to ×1.5, down to ×0.75). wh40k-elo is an Elo
          rating from all of BCP&apos;s games, imported daily. Overall ranks players by a score that
          weighs their wh40k-elo percentile 60% and their points percentile 40% (points alone
          without a wh40k-elo); hover a place for the score.
        </Text>
      </Panel>
    </>
  );

  return (
    <SidebarLayout sidebarLabel="Filters" sidebar={sidebar}>
      <Stack gap="lg">
        <div>
          <PageTitle>Players</PageTitle>
          <Text c="dimmed" mt={4}>
            Ranked by{' '}
            {search.order === 'overall'
              ? 'overall score'
              : search.order === 'wh40kElo'
                ? 'wh40k-elo'
                : 'tournament points'}
          </Text>
        </div>
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
                    {rankings.hasNextPage && (
                      <Group justify="center">
                        <Button
                          variant="light"
                          loading={rankings.isFetchingNextPage}
                          onClick={() => {
                            void rankings.fetchNextPage();
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
    </SidebarLayout>
  );
}
