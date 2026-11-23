import type { CellGame } from '@bcp/shared';
import { Drawer, Stack, Text } from '@mantine/core';
import { PlayerLine } from '../../components/PlayerLine';
import { ErrorState } from '../../components/ErrorState';
import { Card, CardGroup } from '../../components/Scoreboard';
import { plural } from '../../lib/format';
import classes from './CellDrawer.module.css';
import { formatPoints } from '../analysis/format';
import { pickLabel, type MatrixPick } from './matrix-pick';
import { CardsSkeleton } from '../../components/Skeletons';

interface CellDrawerProps {
  cell: MatrixPick | null;
  games: CellGame[] | undefined;
  loading: boolean;
  error: Error | null;
  onClose: () => void;
}

/** The row side's results, best first: each a group of games. */
const OUTCOMES: { outcome: CellGame['outcome']; label: string }[] = [
  { outcome: 'win', label: 'Won' },
  { outcome: 'draw', label: 'Drawn' },
  { outcome: 'loss', label: 'Lost' },
];

function PlayerCell({ side, end = false }: { side: CellGame['row']; end?: boolean }) {
  return (
    <div className={classes.side} data-end={end || undefined}>
      <Text size="sm" fw={600}>
        {side.name}
      </Text>
      <Text size="xs" c="dimmed">
        <PlayerLine {...side} extra={side.teamName} />
      </Text>
    </div>
  );
}

/** A cell's games: event (only shown when the games span more than one), round, table, both
 * sides (faction, disposition, team), result and points. Loading / error / empty states. */
export function CellDrawer({ cell, games: all, loading, error, onClose }: CellDrawerProps) {
  // From a detachment row: only the games the row side played that detachment in.
  const detachment = cell?.detachment;
  const games =
    detachment === undefined
      ? all
      : all?.filter((game) => game.row.detachments.includes(detachment));
  const crossEvent = games !== undefined && new Set(games.map((g) => g.eventId)).size > 1;
  return (
    <Drawer
      opened={cell !== null}
      onClose={onClose}
      position="right"
      size="lg"
      title={cell ? `${pickLabel(cell)} vs ${cell.col}` : undefined}
    >
      {loading && <CardsSkeleton label="Loading games" groups={1} cards={4} dense />}
      {!loading && error && <ErrorState error={error} />}
      {!loading && !error && games?.length === 0 && (
        <Text size="sm" c="dimmed">
          No games for this matchup.
        </Text>
      )}
      {!loading && !error && games && games.length > 0 && (
        <Stack gap="lg">
          {OUTCOMES.map(({ outcome, label }) => {
            const these = games.filter((game) => game.outcome === outcome);
            if (these.length === 0) return null;
            return (
              <CardGroup
                dense
                key={outcome}
                label={label}
                description={`${plural(these.length, 'game')} for ${cell?.row ?? 'the row'}`}
              >
                {these.map((game) => (
                  <Card dense key={game.id}>
                    <span className={classes.where}>
                      {crossEvent && <span className={classes.event}>{game.eventName}</span>}
                      <span className="numeric">
                        R{game.round} · T{game.tableNo ?? '–'}
                      </span>
                    </span>
                    <PlayerCell side={game.row} />
                    <span className={classes.score}>
                      {formatPoints(game.rowPoints)}–{formatPoints(game.colPoints)}
                    </span>
                    <PlayerCell side={game.col} end />
                  </Card>
                ))}
              </CardGroup>
            );
          })}
        </Stack>
      )}
    </Drawer>
  );
}
