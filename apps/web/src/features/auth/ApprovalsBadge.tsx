import { Badge } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { meQuery, usersQuery } from './auth-queries';

/**
 * For an admin signing in through Cloudflare Access: how many people wait for approval (the
 * ignored ones left out), linking to Settings where they're let in.
 */
export function ApprovalsBadge() {
  const me = useQuery(meQuery);
  const admin = me.data?.access === true && me.data.user?.role === 'admin';
  const users = useQuery({ ...usersQuery, enabled: admin, refetchInterval: 60_000 });
  if (!admin) return null;
  const waiting = (users.data?.users ?? []).filter((u) => u.disabled && !u.ignored).length;
  if (waiting === 0) return null;
  return (
    <Badge
      component={Link}
      to="/settings"
      color="yellow"
      variant="filled"
      size="sm"
      style={{ cursor: 'pointer', flexShrink: 0 }}
      aria-label={`${String(waiting)} waiting for approval`}
    >
      {waiting} waiting
    </Badge>
  );
}
