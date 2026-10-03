import type { DetachmentNamesResponse } from '@bcp/shared';
import { Alert, Badge, Button, Group, Select, Skeleton, Stack, Table, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { plural } from '../../lib/format';
import { SortableTh, useTableSort, type SortValue } from '../../lib/table-sort';
import { meQuery } from '../auth/auth-queries';
import classes from './DetachmentNamesCard.module.css';
import {
  detachmentNamesQuery,
  keepDetachment,
  linkDetachment,
  unkeepDetachment,
  unlinkDetachment,
} from './detachment-names-queries';

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
  // BSData's detachments before BCP's names.
  const byBsdata = (list: Target[]) => [
    ...list.filter((t) => t.bsdata),
    ...list.filter((t) => !t.bsdata),
  ];
  const inFaction = targets.filter((t) => t.factions.includes(faction));
  if (inFaction.length > 0) return byBsdata(inFaction).map((t) => t.name);
  const own = targets.filter((t) => t.factions.some((f) => unsure.factions.includes(f)));
  const rest = targets.filter((t) => !own.includes(t));
  return [...byBsdata(own), ...byBsdata(rest)].map((t) => t.name);
}

/** Factions with unsure, foreign or linked names, most unsure names first, as picker options. */
function factionOptions(data: DetachmentNamesResponse) {
  const counts = new Map<string, number>();
  for (const named of [...data.links, ...data.foreign, ...data.learned]) {
    for (const f of named.factions) counts.set(f, counts.get(f) ?? 0);
  }
  for (const unsure of data.unsure) {
    for (const f of unsure.factions) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  for (const pair of [...data.wrong, ...data.kept]) {
    counts.set(pair.faction, counts.get(pair.faction) ?? 0);
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

const NAME_SORT = {
  name: (entry) => entry.name,
  lists: (entry) => entry.lists,
  factions: (entry) => entry.factions.join(', '),
} satisfies Record<string, SortValue<Unsure>>;

/** A table of names, each with its link controls. */
function NamesTable({
  entries,
  foreign = false,
  ...rowProps
}: RowProps & { entries: (Unsure | Foreign)[]; foreign?: boolean }) {
  const { sorted, sort, toggle } = useTableSort(entries, NAME_SORT);
  return (
    <Table.ScrollContainer minWidth={rowProps.faction === ALL ? 640 : 480}>
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <SortableTh column="name" sort={sort} onSort={toggle}>
              Name in lists
            </SortableTh>
            <SortableTh column="lists" sort={sort} onSort={toggle} ta="right">
              Lists
            </SortableTh>
            {rowProps.faction === ALL && (
              <SortableTh column="factions" sort={sort} onSort={toggle}>
                Factions
              </SortableTh>
            )}
            <Table.Th>Means</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((entry) => (
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
  const keep = useMutation({
    mutationFn: ({ faction, name }: { faction: string; name: string }) =>
      keepDetachment(faction, name),
    onSuccess: saved,
  });
  const unkeep = useMutation({
    mutationFn: ({ faction, name }: { faction: string; name: string }) =>
      unkeepDetachment(faction, name),
    onSuccess: saved,
  });
  const error = link.error ?? unlink.error ?? keep.error ?? unkeep.error;
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
  const learned = names.data?.learned.filter(inFaction) ?? [];
  // A faction BSData covers knows BSData's detachments; others the names BCP uses.
  const covered = names.data?.bsdataFactions.includes(faction) === true;
  const known =
    names.data?.targets.filter((t) => t.factions.includes(faction) && (!covered || t.bsdata)) ?? [];
  const ofFaction = (pair: { faction: string }) => faction === ALL || pair.faction === faction;
  const wrong = names.data?.wrong.filter(ofFaction) ?? [];
  const kept = names.data?.kept.filter(ofFaction) ?? [];
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
          {(wrong.length > 0 || kept.length > 0) && (
            <Stack component="section" aria-label="Not in this faction" gap={4}>
              <Text size="sm" fw={600}>
                Not in this faction
              </Text>
              <Text size="xs" c="dimmed">
                Detachments lists use that BSData doesn’t list for their army. Meta counts them as
                detachment unknown, unless you keep them anyway.
              </Text>
              {wrong.map((pair) => (
                <Group key={`${pair.faction}:${pair.name}`} gap="xs">
                  <Text size="sm">{`${pair.name} · ${plural(pair.lists, 'list')}`}</Text>
                  {faction === ALL && (
                    <Text size="sm" c="dimmed">
                      {pair.faction}
                    </Text>
                  )}
                  <Text size="xs" c="dimmed">
                    {pair.bsdataFactions.length === 0
                      ? 'BSData doesn’t list it'
                      : `BSData has it for ${pair.bsdataFactions.join(', ')}`}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    disabled={readOnly}
                    aria-label={`Keep ${pair.name} for ${pair.faction}`}
                    onClick={() => {
                      keep.mutate({ faction: pair.faction, name: pair.name });
                    }}
                  >
                    Keep anyway
                  </Button>
                </Group>
              ))}
              {kept.map((pair) => (
                <Group key={`kept:${pair.faction}:${pair.name}`} gap="xs">
                  <Text size="sm">{pair.name}</Text>
                  <Text size="sm" c="dimmed">
                    {`kept for ${pair.faction}`}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    disabled={readOnly}
                    aria-label={`Undo keep ${pair.name} for ${pair.faction}`}
                    onClick={() => {
                      unkeep.mutate({ faction: pair.faction, name: pair.name });
                    }}
                  >
                    Undo
                  </Button>
                </Group>
              ))}
            </Stack>
          )}
          {learned.length > 0 && (
            <Stack component="section" aria-label="Learned from BCP" gap={4}>
              <Text size="sm" fw={600}>
                Learned from BCP
              </Text>
              <Text size="xs" c="dimmed">
                Names read as translations because players picked that detachment on BCP. If one is
                really a different detachment, say so.
              </Text>
              {learned.map((translation) => (
                <Group key={translation.name} gap="xs">
                  <Text size="sm">{translation.name}</Text>
                  <Text size="sm" c="dimmed">
                    →
                  </Text>
                  <Text size="sm">{translation.target}</Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    disabled={readOnly}
                    aria-label={`${translation.name} is not ${translation.target}`}
                    onClick={() => {
                      link.mutate({ name: translation.name, target: null, foreign: false });
                    }}
                  >
                    Not the same
                  </Button>
                </Group>
              ))}
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
