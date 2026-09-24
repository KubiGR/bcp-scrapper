import type { GameView } from '@bcp/shared';
import { Button, Group, Table, Text } from '@mantine/core';
import { formatPoints } from './format';

interface GamesTableProps {
  games: GameView[];
  /** Called with a player's BCP id when their "List" button is clicked. Omit to hide the buttons. */
  onShowList?: (playerId: string) => void;
  /** Player ids known to the event (from `playersQuery`); a "List" button is hidden for any other. */
  knownPlayerIds?: ReadonlySet<string>;
}

export function GamesTable({ games, onShowList, knownPlayerIds }: GamesTableProps) {
  if (games.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No individual games for this matchup.
      </Text>
    );
  }

  const showListButton = (playerId: string) =>
    onShowList !== undefined && (knownPlayerIds === undefined || knownPlayerIds.has(playerId));

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Table</Table.Th>
            <Table.Th>Player</Table.Th>
            <Table.Th ta="right">GP</Table.Th>
            <Table.Th ta="right">VP</Table.Th>
            <Table.Th ta="right">VP</Table.Th>
            <Table.Th ta="right">GP</Table.Th>
            <Table.Th>Opponent</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {games.map((game) => (
            <Table.Tr key={game.id}>
              <Table.Td className="numeric">{game.tableNo ?? '–'}</Table.Td>
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  <div>
                    <Text size="sm">{game.playerA.name}</Text>
                    <Text size="xs" c="dimmed">
                      {game.playerA.faction ?? 'Unknown faction'}
                      {game.firstTurn === 'a' && ' · went first'}
                    </Text>
                  </div>
                  {showListButton(game.playerA.id) && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      aria-label={`Show ${game.playerA.name}'s list`}
                      onClick={() => onShowList?.(game.playerA.id)}
                    >
                      List
                    </Button>
                  )}
                </Group>
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.gamePointsA)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.vpA)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.vpB)}
              </Table.Td>
              <Table.Td ta="right" className="numeric">
                {formatPoints(game.gamePointsB)}
              </Table.Td>
              <Table.Td>
                {game.playerB ? (
                  (() => {
                    const playerB = game.playerB;
                    return (
                      <Group gap="xs" wrap="nowrap">
                        <div>
                          <Text size="sm">{playerB.name}</Text>
                          <Text size="xs" c="dimmed">
                            {playerB.faction ?? 'Unknown faction'}
                            {game.firstTurn === 'b' && ' · went first'}
                          </Text>
                        </div>
                        {showListButton(playerB.id) && (
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            aria-label={`Show ${playerB.name}'s list`}
                            onClick={() => onShowList?.(playerB.id)}
                          >
                            List
                          </Button>
                        )}
                      </Group>
                    );
                  })()
                ) : (
                  <Text size="sm" c="dimmed">
                    Bye
                  </Text>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
