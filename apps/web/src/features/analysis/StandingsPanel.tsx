import type { EventDetail, StandingCell, StandingRow } from '@bcp/shared';
import { Group, Select, Skeleton, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { Card, scoreboardClasses, Stat } from '../../components/Scoreboard';
import { sortRows, type SortDir, type SortValue } from '../../lib/table-sort';
import classes from './StandingsPanel.module.css';
import { standingsQuery } from './analysis-queries';
import { formatPoints, formatTotals, outcomeLabel } from './format';

function Cell({ cell }: { cell: StandingCell | null }) {
  if (!cell) return <Text c="dimmed">—</Text>;
  return (
    <Text size="sm" className="numeric" title={cell.opponent ? `vs ${cell.opponent.name}` : 'Bye'}>
      {outcomeLabel(cell.outcome)} {formatPoints(cell.points)}
    </Text>
  );
}

/** How the columns sort; W-L-D like standings: most wins, then draws, then fewest losses. */
const STANDING_SORT = {
  placing: (row) => row.placing,
  team: (row) => row.team.name,
  record: ({ totals: t }) =>
    t.wins + t.losses + t.draws === 0 ? null : t.wins * 1_000_000 + t.draws * 1_000 - t.losses,
  points: (row) => row.totals.points,
} satisfies Record<string, SortValue<StandingRow>>;

/** The orders on offer, each its natural way round; placing first. */
const SORTS: { value: keyof typeof STANDING_SORT; label: string; dir: SortDir }[] = [
  { value: 'placing', label: 'Placing', dir: 'asc' },
  { value: 'record', label: 'Record', dir: 'desc' },
  { value: 'points', label: 'Points', dir: 'desc' },
  { value: 'team', label: 'Team A–Z', dir: 'asc' },
];

/** The teams' standings as compact cards: placing, team, record, points and each round's result. */
export function StandingsPanel({ event }: { event: EventDetail }) {
  const standings = useQuery(standingsQuery(event.bcpId, event.pairings.queued > 0));
  const [sortKey, setSortKey] = useState<keyof typeof STANDING_SORT>('placing');
  if (standings.isPending) return <Skeleton height={200} />;
  if (standings.error) {
    return <ErrorState error={standings.error} onRetry={() => void standings.refetch()} />;
  }
  const { rounds, teams } = standings.data;
  if (teams.length === 0) return <Text c="dimmed">No teams stored yet.</Text>;
  const dir = SORTS.find((option) => option.value === sortKey)?.dir ?? 'asc';
  const sorted = sortRows(teams, STANDING_SORT[sortKey], dir);

  return (
    <Stack gap="md">
      <Group justify="flex-end">
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
      </Group>
      <div role="list" aria-label="Standings" className={scoreboardClasses.group} data-dense>
        {sorted.map((row) => (
          <div role="listitem" key={row.team.id}>
            <Card dense>
              <span className={classes.placing}>
                {row.placing === null ? '—' : `#${String(row.placing)}`}
              </span>
              <Text size="sm" fw={600} className={classes.team}>
                <AnchorLink
                  to="/events/$eventId/teams/$teamId"
                  params={{ eventId: event.bcpId, teamId: row.team.id }}
                >
                  {row.team.name}
                </AnchorLink>
              </Text>
              <div className={classes.rounds}>
                {row.perRound.map((cell, index) => {
                  const round = rounds[index];
                  return (
                    <div key={round?.round ?? index} className={classes.round}>
                      <span className={classes.roundLabel}>
                        {round === undefined
                          ? ''
                          : round.bracket
                            ? `R${String(round.round)} · Bracket`
                            : `R${String(round.round)}`}
                      </span>
                      <Cell cell={cell} />
                    </div>
                  );
                })}
              </div>
              <Stat className={classes.figure} value={formatTotals(row.totals)} label="W-L-D" />
              <Stat className={classes.figure} value={row.totals.points} label="points" />
            </Card>
          </div>
        ))}
      </div>
    </Stack>
  );
}
