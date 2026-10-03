import { Anchor, Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { formatDateTime, plural } from '../../lib/format';
import { meQuery } from '../auth/auth-queries';
import { bsdataQuery, refreshBsdata } from './bsdata-queries';

/** Each faction's detachments from BSData: when they were read, how many, and any errors. */
export function BsdataCard() {
  const status = useQuery(bsdataQuery);
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: refreshBsdata,
    onSuccess: async (data) => {
      queryClient.setQueryData(bsdataQuery.queryKey, data);
      // Lists may have new spellings, and Meta new unknowns.
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== bsdataQuery.queryKey[0],
      });
    },
  });
  const readOnly = me.data?.authRequired === true && me.data.user?.role !== 'admin';
  const data = status.data;
  const detachments = data?.factions.reduce((sum, f) => sum + f.detachments, 0) ?? 0;

  return (
    <Panel title="BSData">
      {status.isPending && <Skeleton height={56} />}
      {status.error && <ErrorState error={status.error} onRetry={() => void status.refetch()} />}
      {data && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Each faction’s detachments, from{' '}
            <Anchor href="https://github.com/BSData/wh40k-11e" target="_blank" inherit>
              BSData’s Warhammer 40,000 11th edition data
            </Anchor>
            . Read again once a day.
          </Text>
          {data.checkedAt === null ? (
            <Text size="sm">Not read from BSData yet.</Text>
          ) : (
            <>
              <Text size="sm" className="numeric">
                {`${plural(data.factions.length, 'faction')} · ${plural(detachments, 'detachment')}`}
              </Text>
              <Text size="sm" c="dimmed">{`Checked ${formatDateTime(data.checkedAt)}`}</Text>
            </>
          )}
          {data.errors.map((error) => (
            <Text key={error.path} size="sm" c="red">
              {`${error.path}: ${error.error}`}
            </Text>
          ))}
          {refresh.error && (
            <Text size="sm" c="red">
              {refresh.error.message}
            </Text>
          )}
          <Group>
            <Button
              size="xs"
              variant="outline"
              loading={refresh.isPending}
              disabled={readOnly}
              onClick={() => {
                refresh.mutate();
              }}
            >
              Refresh
            </Button>
            {readOnly && (
              <Text size="xs" c="dimmed">
                Only admins can refresh BSData
              </Text>
            )}
          </Group>
        </Stack>
      )}
    </Panel>
  );
}
