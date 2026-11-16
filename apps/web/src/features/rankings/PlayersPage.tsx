import type { EloFigure, RankedPlayerRow } from '@bcp/shared';
import {
  Box,
  Button,
  Group,
  Input,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SearchSelect } from '../../components/SearchSelect';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { FilterToggle } from '../../components/FilterToggle';
import { Panel } from '../../components/Panel';
import {
  Card,
  CardGroup,
  PageTitle,
  scoreboardClasses,
  SidebarLayout,
  Stat,
} from '../../components/Scoreboard';
import classes from './PlayersPage.module.css';
import { ordinal, plural } from '../../lib/format';
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

/** The rank bands, as the rank badges: crowned top 10, silver top 50, bronze top 100, the rest. */
function bandOf(rank: number): { key: string; label: string } {
  if (rank <= 10) return { key: 'Top 10', label: 'crowned' };
  if (rank <= 50) return { key: 'Top 50', label: 'silver star' };
  if (rank <= 100) return { key: 'Top 100', label: 'bronze star' };
  return { key: 'Ranked', label: 'the rest of the ranking' };
}

/** One ranked player: rank, name and factions, best result, and their figures. */
function PlayerCard({ row }: { row: RankedPlayerRow }) {
  return (
    <div role="listitem">
      <Card dense>
        <span className={classes.rank}>#{row.rank}</span>
        <div className={classes.who}>
          <Text size="sm" fw={600}>
            <AnchorLink to="/players/$userId" params={{ userId: row.userId }}>
              {row.name}
            </AnchorLink>
          </Text>
          <Text size="xs" c="dimmed">
            {row.factions.join(', ')}
          </Text>
        </div>
        <div className={classes.best}>
          <Text size="xs" c="dimmed">
            Best result
          </Text>
          <Text size="sm" className={classes.bestText} title={bestResult(row.best)}>
            {bestResult(row.best)}
          </Text>
        </div>
        <Stat className={classes.figure} value={row.points.toFixed(1)} label="points" />
        <Stat
          className={classes.figure}
          value={
            <HoverHint hint={`Score ${String(Number(row.overall.toFixed(2)))} of 100`}>
              #{row.overallRank}
            </HoverHint>
          }
          label="overall"
        />
        <Stat
          className={classes.figure}
          value={<EloCell figure={row.wh40kElo} />}
          label="wh40k-elo"
        />
        <Stat
          className={classes.figure}
          value={`${String(row.counted)} of ${String(row.results)}`}
          label="events"
        />
      </Card>
    </div>
  );
}

/**
 * The ranked players as cards, in the order asked for. By points, under their rank band (Top 10,
 * Top 50, …); by another order, one list.
 */
function PlayerCards({ rows, byPoints }: { rows: RankedPlayerRow[]; byPoints: boolean }) {
  if (!byPoints) {
    return (
      <div role="list" aria-label="Players" className={scoreboardClasses.group} data-dense>
        {rows.map((row) => (
          <PlayerCard key={row.userId} row={row} />
        ))}
      </div>
    );
  }
  const bands: { key: string; label: string; rows: RankedPlayerRow[] }[] = [];
  for (const row of rows) {
    const band = bandOf(row.rank);
    const last = bands.at(-1);
    if (last?.key === band.key) last.rows.push(row);
    else bands.push({ ...band, rows: [row] });
  }
  return (
    <Stack gap="lg" role="list" aria-label="Players">
      {bands.map((band) => (
        <CardGroup key={band.key} dense label={band.key} description={band.label}>
          {band.rows.map((row) => (
            <PlayerCard key={row.userId} row={row} />
          ))}
        </CardGroup>
      ))}
    </Stack>
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
        <Stack gap="sm">
          <div>
            <Text size="xs" fw={600}>
              Points
            </Text>
            <Text size="xs" c="dimmed">
              The 5 best results of the last 12 months at big events.
            </Text>
            <ul className={classes.facts}>
              <li>
                <Text size="xs" c="dimmed">
                  Size: 1st of 100 players scores 100; of 400, 200; of 20, 45.
                </Text>
              </li>
              <li>
                <Text size="xs" c="dimmed">
                  Field: an average of 1550 wh40k-elo scores ×1; each 100 above adds 50% (×0.75 to
                  ×1.5).
                </Text>
              </li>
            </ul>
          </div>
          <div>
            <Text size="xs" fw={600}>
              Overall
            </Text>
            <Text size="xs" c="dimmed">
              60% wh40k-elo percentile, 40% points percentile (points alone when unrated). Hover a
              place for the score.
            </Text>
          </div>
          <div>
            <Text size="xs" fw={600}>
              wh40k-elo
            </Text>
            <Text size="xs" c="dimmed">
              An Elo rating from all of BCP&apos;s games, imported daily.
            </Text>
          </div>
        </Stack>
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
                    <PlayerCards rows={data.players} byPoints={search.order === undefined} />
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
