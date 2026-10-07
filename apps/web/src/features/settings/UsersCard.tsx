import type { User, UserRole } from '@bcp/shared';
import {
  ActionIcon,
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import {
  createUser,
  meQuery,
  removeUser,
  resetPassword,
  updateUser,
  usersQuery,
} from '../auth/auth-queries';

const PANEL_TITLE = 'Users';

interface OneTimePassword {
  username: string;
  password: string;
}

function statusOf(user: User): string {
  if (user.disabled) return 'Disabled';
  if (user.mustChangePassword) return 'Awaiting first login';
  return 'Active';
}

/** Admins manage who can log in (only shown when logins are on). */
export function UsersCard() {
  const me = useQuery(meQuery);
  // Through Cloudflare Access there are no accounts here: admins are named in the server's settings.
  const self = me.data?.authRequired === true && me.data.access !== true ? me.data.user : null;
  const isAdmin = self?.role === 'admin';
  const users = useQuery({ ...usersQuery, enabled: isAdmin });
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<OneTimePassword | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
  const create = useMutation({
    mutationFn: createUser,
    onSuccess: async ({ user, temporaryPassword }) => {
      setSecret({ username: user.username, password: temporaryPassword });
      await refresh();
    },
  });
  const reset = useMutation({
    mutationFn: (user: User) => resetPassword(user.id),
    onSuccess: async ({ temporaryPassword }, user) => {
      setSecret({ username: user.username, password: temporaryPassword });
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({
      user,
      change,
    }: {
      user: User;
      change: { role?: UserRole; disabled?: boolean };
    }) => updateUser(user.id, change),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (user: User) => removeUser(user.id),
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
  });
  const actionError = reset.error ?? update.error ?? remove.error;

  if (!isAdmin) return null;

  return (
    <Panel title={PANEL_TITLE}>
      <Stack gap="md">
        {users.isPending ? (
          <Skeleton height={80} />
        ) : users.error ? (
          <ErrorState
            title="Users unavailable"
            error={users.error}
            onRetry={() => void users.refetch()}
          />
        ) : (
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Username</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th aria-label="Actions" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.data.users.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm">{user.username}</Text>
                      {user.id === self.id && (
                        <Text size="xs" c="dimmed">
                          you
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{user.role === 'admin' ? 'Admin' : 'Member'}</Table.Td>
                  <Table.Td>
                    <Text size="sm" c={user.disabled ? 'red' : 'dimmed'}>
                      {statusOf(user)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    {user.id !== self.id && (
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={`Actions for ${user.username}`}
                          >
                            ⋯
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            onClick={() => {
                              reset.mutate(user);
                            }}
                          >
                            Reset password
                          </Menu.Item>
                          <Menu.Item
                            onClick={() => {
                              update.mutate({
                                user,
                                change: { role: user.role === 'admin' ? 'member' : 'admin' },
                              });
                            }}
                          >
                            {user.role === 'admin' ? 'Make member' : 'Make admin'}
                          </Menu.Item>
                          <Menu.Item
                            onClick={() => {
                              update.mutate({ user, change: { disabled: !user.disabled } });
                            }}
                          >
                            {user.disabled ? 'Enable' : 'Disable'}
                          </Menu.Item>
                          <Menu.Item
                            color="red"
                            onClick={() => {
                              setRemoving(user);
                            }}
                          >
                            Remove
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {actionError && (
          <Alert color="red" role="alert">
            {actionError.message}
          </Alert>
        )}

        {secret !== null && (
          <Alert color="neon" title={`One-time password for ${secret.username}`}>
            <Stack gap="xs">
              <Text size="sm">
                Give this to {secret.username}. It is shown only once; they choose their own
                password when they log in.
              </Text>
              <Group gap="sm">
                <Code fz="md">{secret.password}</Code>
                <CopyButton value={secret.password}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="outline" onClick={copy} aria-label="Copy password">
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => {
                    setSecret(null);
                  }}
                >
                  Done
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}

        <AddUserForm
          pending={create.isPending}
          error={create.error}
          onAdd={(username, role) => {
            create.mutate({ username, role });
          }}
        />
      </Stack>

      <Modal
        opened={removing !== null}
        onClose={() => {
          setRemoving(null);
        }}
        title="Remove user"
      >
        {removing !== null && (
          <Stack gap="md">
            <Text size="sm">
              Remove {removing.username}? They are logged out and can’t log in again. This can’t be
              undone.
            </Text>
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => {
                  setRemoving(null);
                }}
              >
                Cancel
              </Button>
              <Button
                color="red"
                loading={remove.isPending}
                onClick={() => {
                  remove.mutate(removing);
                }}
              >
                Remove {removing.username}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Panel>
  );
}

interface AddUserFormProps {
  pending: boolean;
  error: Error | null;
  onAdd: (username: string, role: UserRole) => void;
}

function AddUserForm({ pending, error, onAdd }: AddUserFormProps) {
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('member');

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (username.trim() === '') return;
    onAdd(username.trim(), role);
    setUsername('');
  }

  return (
    <form onSubmit={submit}>
      <Group align="flex-end" gap="sm">
        <TextInput
          label="New username"
          value={username}
          onChange={(event) => {
            setUsername(event.currentTarget.value);
          }}
          error={error?.message}
        />
        <Select
          label="Role"
          data={[
            { value: 'member', label: 'Member' },
            { value: 'admin', label: 'Admin' },
          ]}
          value={role}
          onChange={(value) => {
            setRole(value === 'admin' ? 'admin' : 'member');
          }}
          allowDeselect={false}
          w={120}
        />
        <Button type="submit" loading={pending}>
          Add user
        </Button>
      </Group>
    </form>
  );
}
