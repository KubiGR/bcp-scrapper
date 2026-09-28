import { Skeleton, Stack, Switch, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { formatDateTime, plural } from '../../lib/format';
import { meQuery } from '../auth/auth-queries';
import { fetchQueueQuery } from '../fetch-queue/fetch-queue-queries';
import { autoFetchQuery, setAutoFetch } from './auto-fetch-queries';

/** The automatic fetching switch, and how much it still has to do. */
export function AutoFetchCard() {
  const auto = useQuery(autoFetchQuery);
  const me = useQuery(meQuery);
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: setAutoFetch,
    onSuccess: async (state) => {
      queryClient.setQueryData(autoFetchQuery.queryKey, state);
      await queryClient.invalidateQueries({ queryKey: fetchQueueQuery.queryKey });
    },
  });
  const readOnly = me.data?.authRequired === true && me.data.user?.role !== 'admin';

  return (
    <Panel title="Automatic fetching">
      {auto.isPending && <Skeleton height={56} />}
      {auto.error && <ErrorState error={auto.error} onRetry={() => void auto.refetch()} />}
      {auto.data && (
        <Stack gap="xs">
          <Switch
            label={`Fetch big finished events${auto.data.days === null ? '' : ` of the last ${String(auto.data.days)} days`} in the background`}
            checked={auto.data.enabled}
            disabled={readOnly || !auto.data.available || toggle.isPending}
            onChange={(event) => {
              toggle.mutate(event.currentTarget.checked);
            }}
          />
          <Text size="sm" c="dimmed">
            Events, pairings and army lists are queued behind anything you ask for, and fetched at
            the queue's usual pace.
          </Text>
          {auto.data.enabled && (
            <Text size="sm" c="dimmed">
              {auto.data.eventsPending > 0
                ? `${plural(auto.data.eventsPending, 'event')} left`
                : 'Nothing left to fetch'}
              {auto.data.lastPlannedAt && (
                <>
                  {' · last checked '}
                  <span className="numeric">{formatDateTime(auto.data.lastPlannedAt)}</span>
                </>
              )}
            </Text>
          )}
          {!auto.data.available && (
            <Text size="xs" c="dimmed">
              Automatic fetching is turned off on the server (AUTO_FETCH_ENABLED=false).
            </Text>
          )}
          {readOnly && (
            <Text size="xs" c="dimmed">
              Only admins can change this
            </Text>
          )}
          {toggle.error && (
            <Text size="sm" c="red">
              {toggle.error.message}
            </Text>
          )}
        </Stack>
      )}
    </Panel>
  );
}
