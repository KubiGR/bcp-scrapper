import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { formatDateTime, plural } from '../../lib/format';
import { meQuery } from '../auth/auth-queries';
import { refreshRules, rulesQuery } from './rules-queries';
import { PanelSkeleton } from '../../components/Skeletons';

/**
 * Mathhammer's unit data and each faction's detachments from 39k.pro: what was read, when, and
 * the last check's error.
 */
export function RulesCard() {
  const status = useQuery(rulesQuery);
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: refreshRules,
    onSuccess: async (data) => {
      queryClient.setQueryData(rulesQuery.queryKey, data);
      // The detachments come with it: lists may have new spellings, and Meta new unknowns.
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== rulesQuery.queryKey[0],
      });
    },
  });
  const readOnly = me.data?.authRequired === true && me.data.user?.role !== 'admin';
  const data = status.data;

  return (
    <Panel title="Rules data">
      {status.isPending && <PanelSkeleton label="Loading the rules status" lines={2} />}
      {status.error && <ErrorState error={status.error} onRetry={() => void status.refetch()} />}
      {data && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Datasheets and weapons for Mathhammer, and each faction’s detachments, from{' '}
            <Anchor href="https://39k.pro" target="_blank" inherit>
              39k.pro
            </Anchor>
            . Checked again once a day.
          </Text>
          {data.readAt === null || data.counts === null ? (
            <Text size="sm">Not read from 39k.pro yet.</Text>
          ) : (
            <>
              <Text size="sm" className="numeric">
                {`${plural(data.counts.factions, 'faction')} · ${plural(data.counts.datasheets, 'datasheet')} · ${plural(data.counts.weapons, 'weapon')}`}
              </Text>
              <Text size="sm" c="dimmed">
                {`Read ${formatDateTime(data.readAt)}${data.dataVersion === null ? '' : ` · data version ${String(data.dataVersion)}`}`}
              </Text>
            </>
          )}
          {data.checkedAt !== null && (
            <Text size="sm" c="dimmed">{`Checked ${formatDateTime(data.checkedAt)}`}</Text>
          )}
          {data.error !== null && (
            <Text size="sm" c="red">{`Last check failed: ${data.error}`}</Text>
          )}
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
                Only admins can refresh the rules data
              </Text>
            )}
          </Group>
        </Stack>
      )}
    </Panel>
  );
}
