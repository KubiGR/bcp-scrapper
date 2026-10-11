import { Alert, Button, Center, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { login, ME_QUERY_KEY, meQuery, safeNext } from './auth-queries';

interface LoginPageProps {
  /** Where the user was going; only paths on this site are followed. */
  next?: string;
}

export function LoginPage({ next }: LoginPageProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery(meQuery);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const target = safeNext(next);

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: async ({ user }) => {
      queryClient.setQueryData(ME_QUERY_KEY, { authRequired: true, user });
      await navigate({ href: target, replace: true });
    },
  });

  // Already logged in (or no logins at all): nothing to do here.
  if (
    me.data !== undefined &&
    (!me.data.authRequired || me.data.user !== null) &&
    !mutation.isPending
  ) {
    return <GoTo href={target} />;
  }

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (username.trim() === '' || password === '') return;
    mutation.mutate({ username: username.trim(), password });
  }

  return (
    <Center mih="100vh" p="md">
      <Panel w="100%" maw={380}>
        <form onSubmit={submit}>
          <Stack gap="md">
            <Title order={1} size="h3">
              Logis
            </Title>
            {me.error && <ErrorState error={me.error} onRetry={() => void me.refetch()} />}
            <TextInput
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(event) => {
                setUsername(event.currentTarget.value);
              }}
              data-autofocus
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.currentTarget.value);
              }}
            />
            {mutation.error && (
              <Alert color="red" role="alert">
                {mutation.error.message}
              </Alert>
            )}
            <Button type="submit" loading={mutation.isPending}>
              Log in
            </Button>
          </Stack>
        </form>
      </Panel>
    </Center>
  );
}

/** Navigates to a full path (which may carry a query string) once rendered. */
function GoTo({ href }: { href: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ href, replace: true });
  }, [navigate, href]);
  return null;
}
