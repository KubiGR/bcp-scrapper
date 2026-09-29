import { Badge } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { topRanksQuery } from './rankings-queries';

/** "#12" next to a top-100 player's name, linking to their page; nothing for anyone else. */
export function RankBadge({ userId }: { userId: string | null }) {
  const { data } = useQuery({ ...topRanksQuery, enabled: userId !== null });
  if (userId === null) return null;
  const rank = data?.ranks[userId];
  if (rank === undefined) return null;
  return (
    <Link
      to="/players/$userId"
      params={{ userId }}
      aria-label={`Ranked #${String(rank)}`}
      style={{ marginLeft: 6, verticalAlign: 'middle', textDecoration: 'none' }}
      // A row that opens on click (the event's players) shouldn't also open.
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <Badge size="xs" variant="light" color="neon" style={{ cursor: 'pointer' }}>
        #{rank}
      </Badge>
    </Link>
  );
}
