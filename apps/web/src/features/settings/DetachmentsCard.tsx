import { Anchor, Skeleton, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { plural } from '../../lib/format';
import { knownDetachmentsQuery } from './known-detachments-queries';

/** Each faction's detachments, read from 39k.pro with the unit data: how many, and who has none. */
export function DetachmentsCard() {
  const status = useQuery(knownDetachmentsQuery);
  const data = status.data;
  const detachments = data?.factions.reduce((sum, f) => sum + f.detachments, 0) ?? 0;

  return (
    <Panel title="Detachments">
      {status.isPending && <Skeleton height={56} />}
      {status.error && <ErrorState error={status.error} onRetry={() => void status.refetch()} />}
      {data && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Each faction’s detachments, from the GW app’s data on{' '}
            <Anchor href="https://39k.pro" target="_blank" inherit>
              39k.pro
            </Anchor>
            , read with the rules data. (BSData, read until November 2026, was taken down.)
          </Text>
          {data.factions.length === 0 ? (
            <Text size="sm">No detachments read yet.</Text>
          ) : (
            <Text size="sm" className="numeric">
              {`${plural(data.factions.length, 'faction')} · ${plural(detachments, 'detachment')}`}
            </Text>
          )}
          {data.factions.length > 0 && data.uncovered.length > 0 && (
            <Text size="sm" c="dimmed">
              {`No detachments known (BCP’s names count there): ${data.uncovered.join(', ')}`}
            </Text>
          )}
        </Stack>
      )}
    </Panel>
  );
}
