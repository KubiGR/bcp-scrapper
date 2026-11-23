import { Box, Button, Center, Group, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { meQuery } from './auth-queries';
import { ChangePasswordForm } from './ChangePasswordForm';
import { useLogout } from './use-logout';
import { PageSkeleton } from '../../components/Skeletons';

/**
 * Lets the app render only for a logged-in user when logins are on: others go to /login (and
 * come back afterwards); a user with a temporary password chooses their own first.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useQuery(meQuery);
  const href = useRouterState({ select: (state) => state.location.href });
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (me.isPending) {
    return (
      <Box p={{ base: 'md', sm: 'xl' }}>
        <PageSkeleton label="Loading" />
      </Box>
    );
  }
  if (me.error) {
    return (
      <Center mih="100vh" p="md">
        <ErrorState
          title="Can’t reach the app"
          error={me.error}
          onRetry={() => void me.refetch()}
        />
      </Center>
    );
  }
  const { authRequired, user } = me.data;
  if (!authRequired) return children;
  if (user === null) {
    // While the redirect is under way the location is already /login: don't redirect again.
    if (pathname === '/login') return null;
    return <Navigate to="/login" search={{ next: href }} replace />;
  }
  if (user.mustChangePassword) return <FirstPassword username={user.username} />;
  return children;
}

function FirstPassword({ username }: { username: string }) {
  const logout = useLogout();
  return (
    <Center mih="100vh" p="md">
      <Panel w="100%" maw={420}>
        <Stack gap="md">
          <Title order={1} size="h3">
            Choose your password
          </Title>
          <Text size="sm" c="dimmed">
            Welcome, {username}. Replace the one-time password you were given with your own.
          </Text>
          <ChangePasswordForm />
          <Group justify="flex-end">
            <Button
              variant="subtle"
              size="xs"
              onClick={() => {
                logout.mutate();
              }}
            >
              Log out
            </Button>
          </Group>
        </Stack>
      </Panel>
    </Center>
  );
}
