import type { GameView } from '@bcp/shared';
import { Button, Text } from '@mantine/core';
import { PlayerLine } from '../../components/PlayerLine';
import { Card, scoreboardClasses } from '../../components/Scoreboard';
import classes from './GamesTable.module.css';
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

  const side = (player: GameView['playerA'], wentFirst: boolean, alignEnd = false) => (
    <div className={classes.side} data-end={alignEnd || undefined}>
      <div className={classes.who}>
        <Text size="sm" fw={600}>
          <PlayerName name={player.name} userId={player.userId} />
          <RankBadge userId={player.userId ?? null} />
        </Text>
        <Text size="xs" c="dimmed">
          <PlayerLine {...player} extra={wentFirst ? 'went first' : null} />
        </Text>
      </div>
      {showListButton(player.id) && (
        <Button
          size="xs"
          variant="light"
          className={classes.list}
          aria-label={`Show ${player.name}'s list`}
          {...listProps(player.id)}
        >
          List
        </Button>
      )}
    </div>
  );

  // One compact card per game: table, one side, the score (game points over VP), the other side.
  return (
    <div className={scoreboardClasses.group} data-dense>
      {games.map((game) => (
        <Card dense key={game.id}>
          <span className={classes.table} title="Table">
            T{game.tableNo ?? '–'}
          </span>
          {side(game.playerA, game.firstTurn === 'a')}
          <div className={classes.score}>
            <span className={classes.points}>
              {formatPoints(game.gamePointsA)}–{formatPoints(game.gamePointsB)}
            </span>
            <span className={classes.vp}>
              {game.vpA === null && game.vpB === null
                ? 'VP –'
                : `VP ${formatPoints(game.vpA)}–${formatPoints(game.vpB)}`}
            </span>
          </div>
          {game.playerB ? (
            side(game.playerB, game.firstTurn === 'b', true)
          ) : (
            <Text size="sm" c="dimmed" className={classes.side}>
              Bye
            </Text>
          )}
        </Card>
      ))}
    </div>
  );
}
