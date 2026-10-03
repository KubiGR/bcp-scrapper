import type { GameUpdate, GameUpdatePatch } from '@bcp/shared';
import { Badge, Button, Group, Skeleton, Stack, Table, Text, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { formatIsoDay, plural } from '../../lib/format';
import { meQuery } from '../auth/auth-queries';
import { patchGameUpdate, updatesQuery } from './updates-queries';

type Editing = { id: string; field: 'name' | 'start'; value: string } | null;

/**
 * Settings → Game updates: the edition's updates read from BSData's history. Admins can rename
 * one, move its start (e.g. to GW's release day), merge it into the update before, or hide it.
 */
export function UpdatesSection() {
  const updates = useQuery(updatesQuery);
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const readOnly = me.data?.authRequired === true && me.data.user?.role !== 'admin';
  const [editing, setEditing] = useState<Editing>(null);
  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: GameUpdatePatch }) =>
      patchGameUpdate(id, patch),
    onSuccess: (data) => {
      queryClient.setQueryData(updatesQuery.queryKey, data);
      setEditing(null);
    },
  });
  const list = updates.data?.updates ?? [];
  const oldest = list.at(-1)?.id;

  const actions = (update: GameUpdate) => {
    const run = (patch: GameUpdatePatch) => {
      save.mutate({ id: update.id, patch });
    };
    const button = (label: string, aria: string, onClick: () => void) => (
      <Button
        size="compact-xs"
        variant="subtle"
        disabled={readOnly || save.isPending}
        aria-label={aria}
        onClick={onClick}
      >
        {label}
      </Button>
    );
    return (
      <Group gap={4} wrap="wrap">
        {button('Rename', `Rename ${update.name}`, () => {
          setEditing({ id: update.id, field: 'name', value: update.name });
        })}
        {button('Change date', `Change the start of ${update.name}`, () => {
          setEditing({ id: update.id, field: 'start', value: update.start });
        })}
        {update.merged
          ? button('Undo merge', `Undo merge of ${update.name}`, () => {
              run({ merged: false });
            })
          : update.id !== oldest &&
            button('Merge into previous', `Merge ${update.name} into the update before`, () => {
              run({ merged: true });
            })}
        {button(
          update.hidden ? 'Show' : 'Hide',
          `${update.hidden ? 'Show' : 'Hide'} ${update.name}`,
          () => {
            run({ hidden: !update.hidden });
          },
        )}
      </Group>
    );
  };

  return (
    <Panel title="Game updates">
      {updates.isPending && <Skeleton height={56} />}
      {updates.error && <ErrorState error={updates.error} onRetry={() => void updates.refetch()} />}
      {updates.data && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Points (MFM), Faction Packs, Dataslates and codexes, read from BSData’s history. Each
            event counts under the update in force on its first day.
          </Text>
          {list.length === 0 ? (
            <Text size="sm">No updates read from BSData yet.</Text>
          ) : (
            <Table.ScrollContainer minWidth={520}>
              <Table aria-label="Game updates">
                <Table.Tbody>
                  {list.map((update) => (
                    <Table.Tr key={update.id}>
                      <Table.Td>
                        <Text size="sm" c={update.merged || update.hidden ? 'dimmed' : undefined}>
                          {update.name}
                        </Text>
                        {update.summary !== '' && (
                          <Text size="xs" c="dimmed">
                            {update.summary}
                          </Text>
                        )}
                        {update.name !== update.autoName && (
                          <Text size="xs" c="dimmed">{`BSData: ${update.autoName}`}</Text>
                        )}
                        {update.merged && (
                          <Badge size="xs" variant="light" color="gray">
                            Merged into the update before
                          </Badge>
                        )}
                        {update.hidden && (
                          <Badge size="xs" variant="light" color="gray">
                            Hidden
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" className="numeric">
                          {formatIsoDay(update.start)}
                        </Text>
                        {update.start !== update.autoStart && (
                          <Text
                            size="xs"
                            c="dimmed"
                          >{`BSData: ${formatIsoDay(update.autoStart)}`}</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" className="numeric">
                          {plural(update.events, 'event')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {editing?.id === update.id ? (
                          <Group gap={4} wrap="nowrap">
                            <TextInput
                              size="xs"
                              aria-label={editing.field === 'name' ? 'Name' : 'Start (YYYY-MM-DD)'}
                              value={editing.value}
                              onChange={(e) => {
                                setEditing({ ...editing, value: e.currentTarget.value });
                              }}
                            />
                            {editing.field === 'name' && update.suggestions.length > 1 && (
                              <Button
                                size="compact-xs"
                                variant="light"
                                onClick={() => {
                                  // The next generated name after the one shown.
                                  const at = update.suggestions.indexOf(editing.value);
                                  const next =
                                    update.suggestions[(at + 1) % update.suggestions.length];
                                  if (next !== undefined) setEditing({ ...editing, value: next });
                                }}
                              >
                                Suggest
                              </Button>
                            )}
                            <Button
                              size="compact-xs"
                              loading={save.isPending}
                              onClick={() => {
                                const value = editing.value.trim();
                                save.mutate({
                                  id: update.id,
                                  patch:
                                    editing.field === 'name'
                                      ? { name: value === '' ? null : value }
                                      : { start: value === '' ? null : value },
                                });
                              }}
                            >
                              Save
                            </Button>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              onClick={() => {
                                setEditing(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </Group>
                        ) : (
                          actions(update)
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          {save.error && (
            <Text size="sm" c="red">
              {save.error.message}
            </Text>
          )}
          {readOnly && (
            <Text size="xs" c="dimmed">
              Only admins can edit updates
            </Text>
          )}
        </Stack>
      )}
    </Panel>
  );
}
