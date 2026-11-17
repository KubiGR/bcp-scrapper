import type { GameUpdate, GameUpdatePatch } from '@bcp/shared';
import { Badge, Button, Group, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Card, scoreboardClasses } from '../../components/Scoreboard';
import classes from './UpdatesSection.module.css';
import { Panel } from '../../components/Panel';
import { formatIsoDay, plural } from '../../lib/format';
import { meQuery } from '../auth/auth-queries';
import { addGameUpdate, deleteGameUpdate, patchGameUpdate, updatesQuery } from './updates-queries';

type Editing = { id: string; field: 'name' | 'start'; value: string } | null;

/**
 * Settings → Game updates: the edition's updates, read from BSData's history until its takedown
 * and added by hand since. Admins can add one, rename one, move its start (e.g. to GW's release
 * day), merge it into the update before, hide it, or delete one they added.
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
  const [adding, setAdding] = useState({ name: '', start: '' });
  const add = useMutation({
    mutationFn: () => addGameUpdate({ name: adding.name.trim(), start: adding.start.trim() }),
    onSuccess: (data) => {
      queryClient.setQueryData(updatesQuery.queryKey, data);
      setAdding({ name: '', start: '' });
    },
  });
  const remove = useMutation({
    mutationFn: deleteGameUpdate,
    onSuccess: (data) => {
      queryClient.setQueryData(updatesQuery.queryKey, data);
    },
  });
  const list = updates.data?.updates ?? [];
  /** Whether a visible update comes before this one (newest first: later in the list). */
  const hasVisibleBefore = (update: GameUpdate) =>
    list.slice(list.indexOf(update) + 1).some((older) => !older.merged && !older.hidden);

  const actions = (update: GameUpdate) => {
    const run = (patch: GameUpdatePatch) => {
      save.mutate({ id: update.id, patch });
    };
    // Short labels, to fit the column; the full meaning is in the aria label and on hover.
    const button = (label: string, aria: string, onClick: () => void) => (
      <Button
        size="compact-xs"
        variant="subtle"
        disabled={readOnly || save.isPending}
        aria-label={aria}
        title={aria}
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
        {button('Change date', `Change date: ${update.name}`, () => {
          setEditing({ id: update.id, field: 'start', value: update.start });
        })}
        {update.merged
          ? button('Undo merge', `Undo merge of ${update.name}`, () => {
              run({ merged: false });
            })
          : hasVisibleBefore(update) &&
            button('Merge', `Merge into previous: ${update.name}`, () => {
              run({ merged: true });
            })}
        {button(
          update.hidden ? 'Show' : 'Hide',
          `${update.hidden ? 'Show' : 'Hide'} ${update.name}`,
          () => {
            run({ hidden: !update.hidden });
          },
        )}
        {update.added &&
          button('Delete', `Delete ${update.name}`, () => {
            remove.mutate(update.id);
          })}
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
            Points (MFM), Faction Packs, Dataslates and codexes. Read from BSData’s history until it
            was taken down in November 2026; add newer ones below. Each event counts under the
            update in force on its first day.
          </Text>
          {list.length === 0 ? (
            <Text size="sm">No updates yet.</Text>
          ) : (
            <div
              role="list"
              aria-label="Game updates"
              className={scoreboardClasses.group}
              data-dense
            >
              {list.map((update) => (
                <div role="listitem" key={update.id} aria-label={update.name}>
                  <Card dense>
                    <div className={classes.name}>
                      <Text size="sm" c={update.merged || update.hidden ? 'dimmed' : undefined}>
                        {update.name}
                      </Text>
                      {update.summary !== '' && (
                        <Text size="xs" c="dimmed">
                          {update.summary}
                        </Text>
                      )}
                      {!update.added && update.name !== update.autoName && (
                        <Text size="xs" c="dimmed">{`BSData: ${update.autoName}`}</Text>
                      )}
                      {update.added && (
                        <Badge size="xs" variant="light" color="gray">
                          Added by hand
                        </Badge>
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
                    </div>
                    <div className={classes.start}>
                      <Text size="sm" className="numeric">
                        {formatIsoDay(update.start)}
                      </Text>
                      {!update.added && update.start !== update.autoStart && (
                        <Text
                          size="xs"
                          c="dimmed"
                        >{`BSData: ${formatIsoDay(update.autoStart)}`}</Text>
                      )}
                    </div>
                    <Text size="sm" className={`numeric ${classes.events}`}>
                      {plural(update.events, 'event')}
                    </Text>
                    <div className={classes.actions}>
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
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          )}
          {!readOnly && (
            <Group gap="xs" align="flex-end" wrap="wrap">
              <TextInput
                size="xs"
                label="New update"
                placeholder="e.g. Balance Dataslate"
                value={adding.name}
                onChange={(e) => {
                  setAdding({ ...adding, name: e.currentTarget.value });
                }}
              />
              <TextInput
                size="xs"
                label="Starts (YYYY-MM-DD)"
                placeholder="2026-11-20"
                value={adding.start}
                onChange={(e) => {
                  setAdding({ ...adding, start: e.currentTarget.value });
                }}
                w={150}
              />
              <Button
                size="xs"
                loading={add.isPending}
                disabled={adding.name.trim() === '' || adding.start.trim() === ''}
                onClick={() => {
                  add.mutate();
                }}
              >
                Add update
              </Button>
            </Group>
          )}
          {[save.error, add.error, remove.error].map(
            (error) =>
              error && (
                <Text key={error.message} size="sm" c="red">
                  {error.message}
                </Text>
              ),
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
