import type { MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import classes from './RankBadge.module.css';
import { topRanksQuery } from './rankings-queries';

type Tier = 'crown' | 'silver' | 'bronze';

/** The top 10 wear a crown; the rest of the top 50 a silver star, of the top 100 a bronze one. */
function tierOf(rank: number): { tier: Tier; top: number } {
  if (rank <= 10) return { tier: 'crown', top: 10 };
  if (rank <= 50) return { tier: 'silver', top: 50 };
  return { tier: 'bronze', top: 100 };
}

const ICON = {
  viewBox: '0 0 24 24',
  width: 12,
  height: 12,
  fill: 'currentColor',
  'aria-hidden': true,
} as const;

function Crown() {
  return (
    <svg {...ICON}>
      <path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7z" />
    </svg>
  );
}

function Star() {
  return (
    <svg {...ICON}>
      <path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
  );
}

/** Links to the player's page without also opening a row that opens on click. */
const stop = (e: MouseEvent) => {
  e.stopPropagation();
};

/**
 * Beside a player's name: "♛ #8" for a top-100 player and "Elo 1888" for one wh40k-elo rates,
 * each linking to their page; nothing for anyone else.
 */
export function RankBadge({ userId }: { userId: string | null }) {
  const { data } = useQuery({ ...topRanksQuery, enabled: userId !== null });
  if (userId === null) return null;
  const rank = data?.ranks[userId];
  const elo = data?.elo[userId];
  return (
    <>
      {rank !== undefined && <TopRank userId={userId} rank={rank} />}
      {elo !== undefined && (
        <Link
          to="/players/$userId"
          params={{ userId }}
          aria-label={`wh40k-elo ${String(elo)}`}
          className={classes.link}
          onClick={stop}
        >
          <span className={classes.elo}>Elo {elo}</span>
        </Link>
      )}
    </>
  );
}

function TopRank({ userId, rank }: { userId: string; rank: number }) {
  const { tier, top } = tierOf(rank);
  return (
    <Link
      to="/players/$userId"
      params={{ userId }}
      aria-label={`Ranked #${String(rank)}, top ${String(top)}`}
      className={classes.link}
      onClick={stop}
    >
      <span className={classes.badge} data-tier={tier}>
        {tier === 'crown' ? <Crown /> : <Star />}#{rank}
      </span>
    </Link>
  );
}
