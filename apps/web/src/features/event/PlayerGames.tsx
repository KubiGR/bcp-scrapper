import { Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { PlayerLine } from '../../components/PlayerLine';
import { roundsQuery } from '../analysis/analysis-queries';
import { formatPoints, outcomeLabel } from '../analysis/format';
import classes from './PlayerGames.module.css';
import { playerGames } from './player-games';
import { PlayerName } from '../rankings/PlayerName';
import { RankBadge } from '../rankings/RankBadge';

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
              <Table.Td className={`numeric ${classes.fit}`} c="dimmed">
                R{game.round}
              </Table.Td>
              <Table.Td className={classes.fit}>
                {game.outcome && (
                  <span className={classes.outcome} data-outcome={game.outcome}>
                    {outcomeLabel(game.outcome)}
                  </span>
                )}
              </Table.Td>
              <Table.Td className={`numeric ${classes.fit}`}>
                {game.opponent
                  ? `${formatPoints(game.points[0])}–${formatPoints(game.points[1])}`
                  : ''}
              </Table.Td>
              <Table.Td>
                {game.opponent ? (
                  <>
                    <Text size="sm">
                      <PlayerName name={game.opponent.name} userId={game.opponent.userId} />
                      <RankBadge userId={game.opponent.userId ?? null} />
                    </Text>
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
