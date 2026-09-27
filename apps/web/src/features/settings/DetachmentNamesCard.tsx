import type { DetachmentNamesResponse } from '@bcp/shared';
import { Alert, Button, Group, Select, Skeleton, Stack, Table, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { meQuery } from '../auth/auth-queries';
import { detachmentNamesQuery, linkDetachment, unlinkDetachment } from './detachment-names-queries';

type Unsure = DetachmentNamesResponse['unsure'][number];
type Target = DetachmentNamesResponse['targets'][number];

/** BCP's detachment names, those played in the name's factions first. */
function targetOptions(unsure: Unsure, targets: Target[]): string[] {
  const own = targets.filter((t) => t.factions.some((f) => unsure.factions.includes(f)));
  const rest = targets.filter((t) => !own.includes(t));
  return [...own, ...rest].map((t) => t.name);
}

function UnsureRow({
  unsure,
  targets,
  readOnly,
  onLink,
  pending,
}: {
  unsure: Unsure;
  targets: Target[];
  readOnly: boolean;
  onLink: (target: string | null) => void;
  pending: boolean;
}) {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <Table.Tr>
      <Table.Td>{unsure.name}</Table.Td>
      <Table.Td ta="right" className="numeric">
        {unsure.lists}
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {unsure.factions.join(', ')}
        </Text>
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Select
            aria-label={`Link ${unsure.name} to`}
            placeholder="Pick a detachment"
            data={targetOptions(unsure, targets)}
            value={target}
            onChange={setTarget}
            searchable
            disabled={readOnly}
            w={240}
          />
          <Button
            size="xs"
            disabled={readOnly || target === null}
            loading={pending}
            onClick={() => {
              onLink(target);
            }}
          >
            Link
          </Button>
          <Button
            size="xs"
            variant="subtle"
            disabled={readOnly}
            aria-label={`${unsure.name} is its own detachment`}
            onClick={() => {
              onLink(null);
            }}
          >
            Own detachment
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

/**
 * Detachment names lists use but BCP never does (translations, misspellings): link each to the
 * detachment it means, or mark it as its own; links apply to every stored list at once.
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
    mutationFn: ({ name, target }: { name: string; target: string | null }) =>
      linkDetachment(name, target),
    onSuccess: saved,
  });
  const unlink = useMutation({ mutationFn: unlinkDetachment, onSuccess: saved });
  const error = link.error ?? unlink.error;

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
          {names.data.unsure.length === 0 ? (
            <Text size="sm" c="dimmed">
              Every detachment name is known.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name in lists</Table.Th>
                    <Table.Th ta="right">Lists</Table.Th>
                    <Table.Th>Factions</Table.Th>
                    <Table.Th>Means</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {names.data.unsure.map((unsure) => (
                    <UnsureRow
                      key={unsure.name}
                      unsure={unsure}
                      targets={names.data.targets}
                      readOnly={readOnly}
                      pending={link.isPending && link.variables.name === unsure.name}
                      onLink={(target) => {
                        link.mutate({ name: unsure.name, target });
                      }}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          {names.data.links.length > 0 && (
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                Linked names
              </Text>
              {names.data.links.map((linked) => (
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
