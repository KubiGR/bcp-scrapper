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

/** "♛ #8" next to a top-100 player's name, linking to their page; nothing for anyone else. */
export function RankBadge({ userId }: { userId: string | null }) {
  const { data } = useQuery({ ...topRanksQuery, enabled: userId !== null });
  if (userId === null) return null;
  const rank = data?.ranks[userId];
  if (rank === undefined) return null;
  const { tier, top } = tierOf(rank);
  return (
    <Link
      to="/players/$userId"
      params={{ userId }}
      aria-label={`Ranked #${String(rank)}, top ${String(top)}`}
      className={classes.link}
      // A row that opens on click (the event's players) shouldn't also open.
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <span className={classes.badge} data-tier={tier}>
        {tier === 'crown' ? <Crown /> : <Star />}#{rank}
      </span>
    </Link>
  );
}
