import { Container, Skeleton, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { canUsePairings, meQuery } from '../auth/auth-queries';
import { PairingsPage } from './PairingsPage';

/** The pairings planner, for those it's open to (see `canUsePairings`); a short note for others. */
export function PairingsAccess() {
  const me = useQuery(meQuery);
  if (me.isPending) return <Skeleton height={200} />;
  if (!canUsePairings(me.data)) {
    return (
      <Container size="sm" py="xl">
        <Text c="dimmed">
          The pairings planner isn’t open to your account. Ask the site’s admin.
        </Text>
      </Container>
    );
  }
  return <PairingsPage />;
}
