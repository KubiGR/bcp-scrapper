import type { CellGame } from '@bcp/shared';
import { Drawer, Skeleton, Table, Text } from '@mantine/core';
import { PlayerLine } from '../../components/PlayerLine';
import { ErrorState } from '../../components/ErrorState';
import { formatPoints } from '../analysis/format';
import { pickLabel, type MatrixPick } from './matrix-pick';

interface CellDrawerProps {
  cell: MatrixPick | null;
  games: CellGame[] | undefined;
  loading: boolean;
  error: Error | null;
  onClose: () => void;
}

const outcomeLabel = (outcome: CellGame['outcome']) =>
  outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : 'D';

function PlayerCell({ side }: { side: CellGame['row'] }) {
  return (
    <div>
      <Text size="sm">{side.name}</Text>
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
      : all?.filter((game) =>
          detachment === null
            ? game.row.detachments.length === 0
            : game.row.detachments.includes(detachment),
        );
  const crossEvent = games !== undefined && new Set(games.map((g) => g.eventId)).size > 1;
  return (
    <Drawer
      opened={cell !== null}
      onClose={onClose}
      position="right"
      size="lg"
      title={cell ? `${pickLabel(cell)} vs ${cell.col}` : undefined}
    >
      {loading && <Skeleton height={160} />}
      {!loading && error && <ErrorState error={error} />}
      {!loading && !error && games?.length === 0 && (
        <Text size="sm" c="dimmed">
          No games for this matchup.
        </Text>
      )}
      {!loading && !error && games && games.length > 0 && (
        <Table.ScrollContainer minWidth={480}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                {crossEvent && <Table.Th>Event</Table.Th>}
                <Table.Th>Round</Table.Th>
                <Table.Th>Table</Table.Th>
                <Table.Th>{cell?.row}</Table.Th>
                <Table.Th>Result</Table.Th>
                <Table.Th>Points</Table.Th>
                <Table.Th>{cell?.col}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {games.map((game) => (
                <Table.Tr key={game.id}>
                  {crossEvent && <Table.Td>{game.eventName}</Table.Td>}
                  <Table.Td className="numeric">{game.round}</Table.Td>
                  <Table.Td className="numeric">{game.tableNo ?? '–'}</Table.Td>
                  <Table.Td>
                    <PlayerCell side={game.row} />
                  </Table.Td>
                  <Table.Td>{outcomeLabel(game.outcome)}</Table.Td>
                  <Table.Td className="numeric">
                    {formatPoints(game.rowPoints)}–{formatPoints(game.colPoints)}
                  </Table.Td>
                  <Table.Td>
                    <PlayerCell side={game.col} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Drawer>
  );
}
