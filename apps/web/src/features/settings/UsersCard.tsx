import type { ListedUser, User, UserRole } from '@bcp/shared';
import {
  ActionIcon,
  Badge,
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { Card, CardGroup } from '../../components/Scoreboard';
import classes from './UsersCard.module.css';
import {
  createUser,
  meQuery,
  removeUser,
  resetPassword,
  updateUser,
  usersQuery,
} from '../auth/auth-queries';
import { lastSeen } from './last-seen';
import { CardsSkeleton } from '../../components/Skeletons';

const PANEL_TITLE = 'Users';

/** "Seen 3 h ago", the exact time on hover. */
function Seen({ user }: { user: ListedUser }) {
  return (
    <Text
      size="xs"
      c="dimmed"
      title={user.lastSeenAt === null ? undefined : new Date(user.lastSeenAt).toLocaleString()}
    >
      {user.lastSeenAt === null ? 'Never seen' : `Seen ${lastSeen(user.lastSeenAt)}`}
    </Text>
  );
}

/** The most recently seen first, those never seen last. */
const byLastSeen = (a: ListedUser, b: ListedUser) =>
  (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? '');

interface OneTimePassword {
  username: string;
  password: string;
}

function statusOf(user: User, access: boolean): string {
  if (user.disabled) return access ? 'No access' : 'Disabled';
  if (user.mustChangePassword) return 'Awaiting first login';
  return 'Active';
}

/**
 * Admins manage who can log in (only shown when logins are on). Through Cloudflare Access people
 * arrive by themselves and wait to be approved; there are no passwords, and admins are named in
 * the server's settings.
 */
export function UsersCard() {
  const me = useQuery(meQuery);
  const access = me.data?.access === true;
  const self = me.data?.authRequired === true ? me.data.user : null;
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
      change: { role?: UserRole; disabled?: boolean; canPair?: boolean; ignored?: boolean };
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
  const listed = users.data?.users.toSorted(byLastSeen) ?? [];

  if (!isAdmin) return null;

  return (
    <Panel title={PANEL_TITLE}>
      <Stack gap="md">
        {users.isPending ? (
          <CardsSkeleton label="Loading users" groups={1} cards={3} dense />
        ) : users.error ? (
          <ErrorState
            title="Users unavailable"
            error={users.error}
            onRetry={() => void users.refetch()}
          />
        ) : (
          <>
            {access && (
              <WaitingList
                users={listed.filter((u) => u.disabled)}
                pending={update.isPending}
                onApprove={(user) => {
                  update.mutate({ user, change: { disabled: false, ignored: false } });
                }}
                onIgnore={(user, ignored) => {
                  update.mutate({ user, change: { ignored } });
                }}
                onRemove={setRemoving}
              />
            )}
            {(['admin', 'member'] as const).map((role) => {
              const these = listed.filter(
                (user) =>
                  (!access || !user.disabled) && (user.role === 'admin') === (role === 'admin'),
              );
              if (these.length === 0) return null;
              return (
                <CardGroup
                  dense
                  key={role}
                  label={String(these.length)}
                  description={role === 'admin' ? 'Admins' : 'Members'}
                  ariaLabel={role === 'admin' ? 'Admins' : 'Members'}
                >
                  {these.map((user) => (
                    <Card dense key={user.id}>
                      <div className={classes.who}>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                            {user.username}
                          </Text>
                          {user.id === self.id && (
                            <Text size="xs" c="dimmed">
                              you
                            </Text>
                          )}
                        </Group>
                        {/* On a phone, role and status sit here instead of their own columns. */}
                        <Text size="xs" c="dimmed" hiddenFrom="sm">
                          {`${user.role === 'admin' ? 'Admin' : 'Member'}${
                            user.role !== 'admin' && user.canPair ? ' · Pairings' : ''
                          } · ${statusOf(user, access)}`}
                        </Text>
                        <Seen user={user} />
                      </div>
                      <div className={classes.role}>
                        <Group gap={6} wrap="nowrap">
                          {user.role === 'admin' ? (
                            <Badge variant="outline" color="neon" size="sm">
                              Admin
                            </Badge>
                          ) : (
                            <Text size="sm">Member</Text>
                          )}
                          {/* Admins always have the pairings planner; members only when given it. */}
                          {user.role !== 'admin' && user.canPair && (
                            <Badge variant="light" color="neon" size="sm">
                              Pairings
                            </Badge>
                          )}
                        </Group>
                      </div>
                      <div className={classes.status}>
                        <Text size="sm" c={user.disabled ? 'red' : 'dimmed'}>
                          {statusOf(user, access)}
                        </Text>
                      </div>
                      <div className={classes.actions}>
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
                              {!access && (
                                <Menu.Item
                                  onClick={() => {
                                    reset.mutate(user);
                                  }}
                                >
                                  Reset password
                                </Menu.Item>
                              )}
                              {!access && (
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
                              )}
                              {user.role !== 'admin' && (
                                <Menu.Item
                                  onClick={() => {
                                    update.mutate({ user, change: { canPair: !user.canPair } });
                                  }}
                                >
                                  {user.canPair ? 'Remove Pairings' : 'Allow Pairings'}
                                </Menu.Item>
                              )}
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
                      </div>
                    </Card>
                  ))}
                </CardGroup>
              );
            })}
          </>
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

        {!access && (
          <AddUserForm
            pending={create.isPending}
            error={create.error}
            onAdd={(username, role) => {
              create.mutate({ username, role });
            }}
          />
        )}
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
              {access
                ? `Remove ${removing.username}? They lose access; if they sign in again, they wait for approval again.`
                : `Remove ${removing.username}? They are logged out and can’t log in again. This can’t be undone.`}
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

/**
 * Through Access: who signed in and waits to be let in, each to approve, ignore or remove. The
 * ignored stay locked out but out of the way, in a list of their own.
 */
function WaitingList({
  users,
  pending,
  onApprove,
  onIgnore,
  onRemove,
}: {
  users: ListedUser[];
  pending: boolean;
  onApprove: (user: User) => void;
  onIgnore: (user: User, ignored: boolean) => void;
  onRemove: (user: User) => void;
}) {
  const [showIgnored, setShowIgnored] = useState(false);
  const waiting = users.filter((u) => !u.ignored);
  const ignored = users.filter((u) => u.ignored);
  const row = (user: ListedUser) => (
    <Card dense key={user.id}>
      <Stack gap={0}>
        <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
          {user.username}
        </Text>
        <Seen user={user} />
      </Stack>
      <Group gap="xs" wrap="nowrap">
        <Button
          size="xs"
          loading={pending}
          aria-label={`Approve ${user.username}`}
          onClick={() => {
            onApprove(user);
          }}
        >
          Approve
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          aria-label={`${user.ignored ? 'Stop ignoring' : 'Ignore'} ${user.username}`}
          onClick={() => {
            onIgnore(user, !user.ignored);
          }}
        >
          {user.ignored ? 'Stop ignoring' : 'Ignore'}
        </Button>
        <Button
          size="xs"
          variant="subtle"
          color="red"
          aria-label={`Remove ${user.username}`}
          onClick={() => {
            onRemove(user);
          }}
        >
          Remove
        </Button>
      </Group>
    </Card>
  );
  return (
    <Stack gap="xs">
      <CardGroup
        dense
        label={String(waiting.length)}
        description="Waiting for approval"
        ariaLabel="Waiting for approval"
      >
        {waiting.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nobody is waiting. Friends sign in with Google at this site's address and show up here.
          </Text>
        ) : (
          waiting.map(row)
        )}
      </CardGroup>
      {ignored.length > 0 && (
        <Stack gap="xs">
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            style={{ alignSelf: 'flex-start' }}
            aria-expanded={showIgnored}
            onClick={() => {
              setShowIgnored(!showIgnored);
            }}
          >
            {`Ignored (${String(ignored.length)})`}
          </Button>
          {showIgnored && ignored.map(row)}
        </Stack>
      )}
    </Stack>
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
