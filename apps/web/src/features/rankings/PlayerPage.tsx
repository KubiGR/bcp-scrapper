import { strengthFactor, type EloFigure, type PlayerHistoryEntry } from '@bcp/shared';
import { Anchor, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { AnchorLink } from '../../components/AnchorLink';
import { ErrorState } from '../../components/ErrorState';
import { NewLeaf, playedLately } from '../../components/EventSymbols';
import { Card, CardGroup, Stat } from '../../components/Scoreboard';
import classes from './PlayerPage.module.css';
import { formatIsoDay, ordinal } from '../../lib/format';
import { playerRankingQuery } from './rankings-queries';
import { FactionIcon } from '../../components/FactionIcon';
import { HoverHint } from '../../components/HoverHint';
import { usePageTitle } from '../../lib/page-title';
import { PageSkeleton, TilesSkeleton, TitleSkeleton } from '../../components/Skeletons';

/** wh40k-elo's site (it has no page per player). */
const WH40K_ELO_SITE = 'https://wh40k-elo.duckdns.org/';

/** "1612 (23 games)", or "–" when unrated. */
const eloText = (figure: EloFigure | null) =>
  figure === null
    ? '–'
    : `${String(figure.elo)} (${String(figure.games)} ${figure.games === 1 ? 'game' : 'games'})`;

/** The field's average wh40k-elo, and how much it weighs the score, on hover. */
function FieldStrength({ fieldElo }: { fieldElo: number | null }) {
  const factor = `score ×${String(Number(strengthFactor(fieldElo).toFixed(2)))}`;
  const what =
    fieldElo === null ? 'Too few rated players to tell' : 'Average wh40k-elo of the field';
  return (
    <HoverHint hint={`${what} · ${factor}`} label={`Field: ${what.toLowerCase()} · ${factor}`}>
      {fieldElo ?? '–'}
    </HoverHint>
  );
}

/** "3rd of 64"; team events "2nd of 20 teams"; "–" without a placing. */
const placingText = (entry: PlayerHistoryEntry) =>
  entry.placing === null || entry.field === null
    ? '–'
    : `${ordinal(entry.placing)} of ${String(entry.field)}${entry.isTeamEvent ? ' teams' : ''}`;

/** One event the player played: placing, event, army, field, score; the counted ones bright. */
function HistoryCard({ entry }: { entry: PlayerHistoryEntry }) {
  const dim = entry.score === null ? 'dimmed' : undefined;
  const army = [entry.faction, entry.detachments.join(' + ')].filter(Boolean).join(' · ');
  return (
    <Card dense className={classes.entry}>
      <div data-counted={entry.score !== null} className={classes.entryInner}>
        <Text c={dim} className={`numeric ${classes.placing}`}>
          {placingText(entry)}
        </Text>
        <div className={classes.event}>
          <Text>
            <AnchorLink
              to="/events/$eventId"
              params={{ eventId: entry.eventId }}
              search={{ tab: 'players' }}
            >
              {entry.eventName}
            </AnchorLink>
            {playedLately(entry.eventStart) && <NewLeaf />}
          </Text>
          <Text size="xs" c="dimmed" className="numeric">
            {formatIsoDay(entry.eventStart)}
            {entry.teamName !== null && ` · ${entry.teamName}`}
          </Text>
        </div>
        <Text size="sm" c={dim} className={classes.army}>
          <FactionIcon faction={entry.faction} size={20} />
          {army || '–'}
        </Text>
        <Stat
          className={classes.figure}
          value={<FieldStrength fieldElo={entry.fieldElo} />}
          label="field"
        />
        <Stat
          className={classes.figure}
          value={entry.score === null ? '–' : entry.score.toFixed(1)}
          label="score"
        />
        <div className={classes.marks}>
          {entry.counts && (
            <Text span c="neon.4" aria-label="Counts" title="One of the 5 best: counts">
              ✓
            </Text>
          )}
          {entry.hasList && (
            <AnchorLink
              to="/events/$eventId"
              params={{ eventId: entry.eventId }}
              search={{ tab: 'players', list: entry.playerId }}
            >
              List
            </AnchorLink>
          )}
        </div>
      </div>
    </Card>
  );
}

/** One player's ranking and every event they played, the counted results marked. */
export function PlayerPage({ userId }: { userId: string }) {
  const player = useQuery(playerRankingQuery(userId));
  usePageTitle(player.data?.name ?? 'Player');
  if (player.isPending) {
    return (
      <PageSkeleton
        label="Loading the player"
        header={
          <>
            <TitleSkeleton />
            <TilesSkeleton />
          </>
        }
      />
    );
  }
  if (player.error) {
    return player.error instanceof ApiError && player.error.status === 404 ? (
      <Text c="dimmed">No player with that account.</Text>
    ) : (
      <ErrorState error={player.error} onRetry={() => void player.refetch()} />
    );
  }
  const { data } = player;
  const counted = data.history.filter((entry) => entry.counts);
  const others = data.history.filter((entry) => !entry.counts);
  return (
    <Stack gap="xl">
      <div className={classes.heading}>
        <Stack gap={4}>
          <Title order={1}>{data.name}</Title>
          <Text className="numeric">
            {data.rank === null
              ? 'Not ranked: no counted results in the last 12 months.'
              : `#${String(data.rank)} of ${data.ranked.toLocaleString('en-GB')} · ${data.points.toFixed(1)} points`}
          </Text>
          <Text size="sm" className="numeric">
            <Anchor href={WH40K_ELO_SITE} target="_blank" rel="noreferrer" inherit>
              wh40k-elo
            </Anchor>{' '}
            {eloText(data.wh40kElo)}
          </Text>
          {data.dropsOn !== null && (
            <Text size="sm" c="dimmed">
              Oldest counted result drops out on {formatIsoDay(data.dropsOn)}
            </Text>
          )}
        </Stack>
        {data.rank !== null && <span className={classes.rank}>#{data.rank}</span>}
      </div>
      <section aria-label="History" className={classes.history}>
        {counted.length > 0 && (
          <CardGroup dense label="Counts" description="the 5 best results, which make the points">
            {counted.map((entry) => (
              <HistoryCard key={entry.playerId} entry={entry} />
            ))}
          </CardGroup>
        )}
        {others.length > 0 && (
          <CardGroup dense label="Other" description="results that don’t count now">
            {others.map((entry) => (
              <HistoryCard key={entry.playerId} entry={entry} />
            ))}
          </CardGroup>
        )}
      </section>
    </Stack>
  );
}
