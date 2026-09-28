import type { DetachmentNamesResponse } from '@bcp/shared';
import { Alert, Badge, Button, Group, Select, Skeleton, Stack, Table, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { meQuery } from '../auth/auth-queries';
import classes from './DetachmentNamesCard.module.css';
import { detachmentNamesQuery, linkDetachment, unlinkDetachment } from './detachment-names-queries';

type Unsure = DetachmentNamesResponse['unsure'][number];
type Foreign = DetachmentNamesResponse['foreign'][number];
type Target = DetachmentNamesResponse['targets'][number];
interface LinkRequest {
  name: string;
  target: string | null;
  foreign: boolean;
}

const ALL = '';

/**
 * BCP's detachment names to link to: only the chosen faction's (when it has any), otherwise
 * every one, those played in the name's factions first.
 */
function targetOptions(unsure: Unsure, targets: Target[], faction: string): string[] {
  const inFaction = targets.filter((t) => t.factions.includes(faction));
  if (inFaction.length > 0) return inFaction.map((t) => t.name);
  const own = targets.filter((t) => t.factions.some((f) => unsure.factions.includes(f)));
  const rest = targets.filter((t) => !own.includes(t));
  return [...own, ...rest].map((t) => t.name);
}

/** Factions with unsure, foreign or linked names, most unsure names first, as picker options. */
function factionOptions(data: DetachmentNamesResponse) {
  const counts = new Map<string, number>();
  for (const named of [...data.links, ...data.foreign]) {
    for (const f of named.factions) counts.set(f, counts.get(f) ?? 0);
  }
  for (const unsure of data.unsure) {
    for (const f of unsure.factions) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([faction, count]) => ({ value: faction, label: `${faction} (${String(count)})` }));
}

interface RowProps {
  targets: Target[];
  /** The picked faction, or ALL (then the row also says which factions play the name). */
  faction: string;
  readOnly: boolean;
  /** The name being saved, if any. */
  saving: string | null;
  onLink: (request: LinkRequest) => void;
  onUndo: (name: string) => void;
}

/** One name: link it, or say it's its own detachment / not English (or, if foreign, English). */
function NameRow({
  entry,
  foreign,
  targets,
  faction,
  readOnly,
  saving,
  onLink,
  onUndo,
}: RowProps & { entry: Unsure; foreign?: Foreign }) {
  const [target, setTarget] = useState<string | null>(null);
  const link = (request: Omit<LinkRequest, 'name'>) => {
    onLink({ name: entry.name, ...request });
  };
  return (
    <Table.Tr>
      <Table.Td>{entry.name}</Table.Td>
      <Table.Td ta="right" className="numeric">
        {entry.lists}
      </Table.Td>
      {faction === ALL && (
        <Table.Td>
          <Text size="sm" c="dimmed">
            {entry.factions.join(', ')}
          </Text>
        </Table.Td>
      )}
      <Table.Td>
        <Group gap="xs">
          <Select
            aria-label={`Link ${entry.name} to`}
            placeholder="Pick a detachment"
            data={targetOptions(entry, targets, faction)}
            value={target}
            onChange={setTarget}
            searchable
            disabled={readOnly}
            w={{ base: '100%', xs: 240 }}
          />
          <Button
            size="xs"
            disabled={readOnly || target === null}
            loading={saving === entry.name}
            onClick={() => {
              link({ target, foreign: false });
            }}
          >
            Link
          </Button>
          {foreign === undefined ? (
            <>
              <Button
                size="xs"
                variant="subtle"
                disabled={readOnly}
                aria-label={`${entry.name} is its own detachment`}
                onClick={() => {
                  link({ target: null, foreign: false });
                }}
              >
                Own detachment
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                disabled={readOnly}
                aria-label={`${entry.name} is not in English`}
                onClick={() => {
                  link({ target: null, foreign: true });
                }}
              >
                Not English
              </Button>
            </>
          ) : (
            <>
              <Button
                size="xs"
                variant="subtle"
                disabled={readOnly}
                aria-label={`${entry.name} is English`}
                onClick={() => {
                  link({ target: null, foreign: false });
                }}
              >
                It’s English
              </Button>
              {foreign.marked && (
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  disabled={readOnly}
                  aria-label={`Undo Not English for ${entry.name}`}
                  onClick={() => {
                    onUndo(entry.name);
                  }}
                >
                  Undo
                </Button>
              )}
            </>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

/** A table of names, each with its link controls. */
function NamesTable({
  entries,
  foreign = false,
  ...rowProps
}: RowProps & { entries: (Unsure | Foreign)[]; foreign?: boolean }) {
  return (
    <Table.ScrollContainer minWidth={rowProps.faction === ALL ? 640 : 480}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name in lists</Table.Th>
            <Table.Th ta="right">Lists</Table.Th>
            {rowProps.faction === ALL && <Table.Th>Factions</Table.Th>}
            <Table.Th>Means</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entries.map((entry) => (
            <NameRow
              key={entry.name}
              entry={entry}
              foreign={foreign && 'marked' in entry ? entry : undefined}
              {...rowProps}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/**
 * Detachment names lists use but BCP never does (translations, misspellings): link each to the
 * detachment it means, mark it as its own, or as not English (Meta then counts it as detachment
 * unknown); links apply to every stored list at once.
 */
export function DetachmentNamesCard() {
  const names = useQuery(detachmentNamesQuery);
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const readOnly = me.data?.authRequired === true && me.data.user?.role !== 'admin';
  const saved = async (data: DetachmentNamesResponse) => {
    queryClient.setQueryData(detachmentNamesQuery.queryKey, data);
    // Every analysis that shows detachments has new names now.
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== detachmentNamesQuery.queryKey[0],
    });
  };
  const link = useMutation({
    mutationFn: ({ name, target, foreign }: LinkRequest) => linkDetachment(name, target, foreign),
    onSuccess: saved,
  });
  const unlink = useMutation({ mutationFn: unlinkDetachment, onSuccess: saved });
  const error = link.error ?? unlink.error;
  const [picked, setPicked] = useState<string | null>(null);
  const factions = names.data ? factionOptions(names.data) : [];
  // The picked faction, or the one with the most unsure names (a faction with none left drops out).
  const faction =
    picked === ALL || factions.some((f) => f.value === picked)
      ? (picked ?? ALL)
      : (factions[0]?.value ?? ALL);
  const inFaction = (list: { factions: string[] }) =>
    faction === ALL || list.factions.includes(faction);
  const unsure = names.data?.unsure.filter(inFaction) ?? [];
  const foreign = names.data?.foreign.filter(inFaction) ?? [];
  const links = names.data?.links.filter(inFaction) ?? [];
  const known = names.data?.targets.filter((t) => t.factions.includes(faction)) ?? [];
  const rowProps: RowProps = {
    targets: names.data?.targets ?? [],
    faction,
    readOnly,
    saving: link.isPending ? link.variables.name : null,
    onLink: (request) => {
      link.mutate(request);
    },
    onUndo: (name) => {
      unlink.mutate(name);
    },
  };

  return (
    <Panel title="Detachment names">
      {names.isPending && <Skeleton height={80} />}
      {names.error && <ErrorState error={names.error} onRetry={() => void names.refetch()} />}
      {names.data && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Names used in lists that BCP never uses — often a translation or a misspelling. Link
            each to the detachment it means, or mark it as its own.
          </Text>
          {readOnly && (
            <Text size="xs" c="dimmed">
              Only admins can link detachment names.
            </Text>
          )}
          {error && (
            <Alert color="red" role="alert">
              {error.message}
            </Alert>
          )}
          {factions.length > 0 && (
            <Select
              label="Faction"
              data={[{ value: ALL, label: 'All factions' }, ...factions]}
              value={faction}
              onChange={(value) => {
                setPicked(value ?? ALL);
              }}
              allowDeselect={false}
              searchable
              w={{ base: '100%', xs: 280 }}
            />
          )}
          {faction !== ALL && known.length > 0 && (
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                Known {faction} detachments
              </Text>
              <Group
                component="ul"
                aria-label={`Known ${faction} detachments`}
                gap={6}
                className={classes.known}
              >
                {known.map((target) => (
                  <Badge component="li" key={target.name} variant="light" color="gray">
                    {target.name}
                  </Badge>
                ))}
              </Group>
            </Stack>
          )}
          {names.data.unsure.length === 0 ? (
            <Text size="sm" c="dimmed">
              Every detachment name is known.
            </Text>
          ) : (
            unsure.length > 0 && <NamesTable entries={unsure} {...rowProps} />
          )}
          {foreign.length > 0 && (
            <Stack component="section" aria-label="Not in English" gap={4}>
              <Text size="sm" fw={600}>
                Not in English
              </Text>
              <Text size="xs" c="dimmed">
                Lists keep these names, but Meta counts them as detachment unknown. Link one to the
                detachment it means to count it.
              </Text>
              <NamesTable entries={foreign} foreign {...rowProps} />
            </Stack>
          )}
          {links.length > 0 && (
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                Linked names
              </Text>
              {links.map((linked) => (
                <Group key={linked.name} gap="xs">
                  <Text size="sm">{linked.name}</Text>
                  <Text size="sm" c="dimmed">
                    →
                  </Text>
                  <Text size="sm">{linked.target ?? 'its own detachment'}</Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    disabled={readOnly}
                    aria-label={`Undo link for ${linked.name}`}
                    onClick={() => {
                      unlink.mutate(linked.name);
                    }}
                  >
                    Undo
                  </Button>
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </Panel>
  );
}
