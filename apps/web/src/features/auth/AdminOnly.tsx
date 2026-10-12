import { Container, Skeleton, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { isAdminView, meQuery } from './auth-queries';

/** A page for admins only (everyone when logins are off); a short note for anyone else. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const me = useQuery(meQuery);
  if (me.isPending) return <Skeleton height={200} />;
  if (!isAdminView(me.data)) {
    return (
      <Container size="sm" py="xl">
        <Text c="dimmed">This page is for the site’s admins only.</Text>
      </Container>
    );
  }
  return <>{children}</>;
}
