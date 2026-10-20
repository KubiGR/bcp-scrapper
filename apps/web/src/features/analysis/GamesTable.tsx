import type { GameView } from '@bcp/shared';
import { Button, Group, Table, Text } from '@mantine/core';
import { PlayerLine } from '../../components/PlayerLine';
import { listPath, openHere } from '../../lib/open-link';
import { formatPoints } from './format';
import { PlayerName } from '../rankings/PlayerName';
import { RankBadge } from '../rankings/RankBadge';

interface GamesTableProps {
  games: GameView[];
  /** Called with a player's BCP id when their "List" button is clicked. Omit to hide the buttons. */
  onShowList?: (playerId: string) => void;
  /** The event, so each "List" is also a link to the list (to open in a new tab). */
  eventId?: string;
  /** Player ids known to the event (from `playersQuery`); a "List" button is hidden for any other. */
  knownPlayerIds?: ReadonlySet<string>;
}

export function GamesTable({ games, onShowList, eventId, knownPlayerIds }: GamesTableProps) {
  // A link when the event is known: a plain click opens the drawer, ⌘-click a new tab.
  const listProps = (playerId: string) =>
    eventId === undefined
      ? { onClick: () => onShowList?.(playerId) }
      : {
          component: 'a' as const,
          href: listPath(eventId, playerId),
          onClick: openHere(() => onShowList?.(playerId)),
        };

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
                    <Text size="sm">
                      <PlayerName name={game.playerA.name} userId={game.playerA.userId} />
                      <RankBadge userId={game.playerA.userId ?? null} />
                    </Text>
                    <Text size="xs" c="dimmed">
                      <PlayerLine
                        {...game.playerA}
                        extra={game.firstTurn === 'a' ? 'went first' : null}
                      />
                    </Text>
                  </div>
                  {showListButton(game.playerA.id) && (
                    <Button
                      size="xs"
                      variant="light"
                      style={{ flexShrink: 0 }}
                      aria-label={`Show ${game.playerA.name}'s list`}
                      {...listProps(game.playerA.id)}
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
                          <Text size="sm">
                            <PlayerName name={playerB.name} userId={playerB.userId} />
                            <RankBadge userId={playerB.userId ?? null} />
                          </Text>
                          <Text size="xs" c="dimmed">
                            <PlayerLine
                              {...playerB}
                              extra={game.firstTurn === 'b' ? 'went first' : null}
                            />
                          </Text>
                        </div>
                        {showListButton(playerB.id) && (
                          <Button
                            size="xs"
                            variant="light"
                            style={{ flexShrink: 0 }}
                            aria-label={`Show ${playerB.name}'s list`}
                            {...listProps(playerB.id)}
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
