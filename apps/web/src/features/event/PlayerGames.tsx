import { Badge, Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { PlayerLine } from '../../components/PlayerLine';
import { roundsQuery } from '../analysis/analysis-queries';
import { formatPoints, outcomeLabel } from '../analysis/format';
import { playerGames } from './player-games';

const OUTCOME_COLOR = { win: 'teal', loss: 'red', draw: 'gray', bye: 'gray' } as const;

/**
 * A player's games in the event, round by round: result, score, the opponent's army, and who went
 * first. Nothing shows when the event's rounds aren't stored (or the player has no games yet).
 */
export function PlayerGames({
  eventId,
  playerId,
  playerName,
}: {
  eventId: string;
  playerId: string;
  playerName: string;
}) {
  const rounds = useQuery({ ...roundsQuery(eventId, false), retry: false });
  const games = rounds.data ? playerGames(rounds.data.rounds, playerId) : [];
  if (games.length === 0) return null;
  return (
    <Stack component="section" aria-label="Games" gap={4}>
      <Text size="sm" fw={600}>
        Games
      </Text>
      <Table verticalSpacing={4} fz="sm">
        <Table.Tbody>
          {games.map((game) => (
            <Table.Tr key={game.round}>
              <Table.Td w={36} className="numeric" c="dimmed">
                R{game.round}
              </Table.Td>
              <Table.Td w={44}>
                {game.outcome && (
                  <Badge size="sm" variant="light" color={OUTCOME_COLOR[game.outcome]}>
                    {outcomeLabel(game.outcome)}
                  </Badge>
                )}
              </Table.Td>
              <Table.Td w={64} className="numeric">
                {game.opponent
                  ? `${formatPoints(game.points[0])}–${formatPoints(game.points[1])}`
                  : ''}
              </Table.Td>
              <Table.Td>
                {game.opponent ? (
                  <>
                    <Text size="sm">{game.opponent.name}</Text>
                    <Text size="xs" c="dimmed">
                      <PlayerLine
                        {...game.opponent}
                        extra={
                          game.wentFirst === null
                            ? null
                            : `${game.wentFirst ? playerName : game.opponent.name} went first`
                        }
                      />
                    </Text>
                  </>
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
    </Stack>
  );
}
