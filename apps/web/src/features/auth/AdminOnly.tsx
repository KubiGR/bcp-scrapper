import { Container, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { isAdminView, meQuery } from './auth-queries';
import { PageSkeleton } from '../../components/Skeletons';

/** A page for admins only (everyone when logins are off); a short note for anyone else. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const me = useQuery(meQuery);
  if (me.isPending) return <PageSkeleton label="Loading" />;
  if (!isAdminView(me.data)) {
    return (
      <Container size="sm" py="xl">
        <Text c="dimmed">This page is for the site’s admins only.</Text>
      </Container>
    );
  }
  return <>{children}</>;
}
