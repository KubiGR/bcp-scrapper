import type { BcpStatus } from '@bcp/shared';
import { Badge, Group, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { formatDateTime } from '../../lib/format';
import { bcpStatusQuery } from './bcp-status-query';
import classes from './BcpStatusCard.module.css';
import { PanelSkeleton } from '../../components/Skeletons';

const PANEL_TITLE = 'BCP uplink';

interface StatusView {
  label: string;
  color: string;
  description: string;
}

function describeStatus(status: BcpStatus): StatusView {
  switch (status.state) {
    case 'fixtures':
      return {
        label: 'Offline · fixtures',
        color: 'gray',
        description:
          'Serving saved sample data. Set TOURNAMENT_SOURCE=bcp in .env to connect to Best Coast Pairings.',
      };
    case 'connected':
      return {
        label: 'Connected',
        color: 'neon',
        description: status.accessTokenExpiresAt
          ? `Token valid until ${formatDateTime(status.accessTokenExpiresAt)}. It refreshes automatically.`
          : 'Token active. It refreshes automatically.',
      };
    case 'rejected':
      return {
        label: 'Login expired',
        color: 'red',
        description:
          'BCP rejected the saved login. Log in at bestcoastpairings.com, put a fresh refresh token in BCP_REFRESH_TOKEN (.env, or the Portainer stack’s environment) and restart the app; fetching starts again by itself.',
      };
    case 'missing':
      return {
        label: 'Not connected',
        color: 'red',
        description:
          'No valid BCP login. Set BCP_REFRESH_TOKEN (.env, or the Portainer stack’s environment; see the README) and restart the app.',
      };
  }
}

export function BcpStatusCard() {
  const { data, error, isPending, refetch } = useQuery(bcpStatusQuery);

  if (isPending) {
    return (
      <Panel title={PANEL_TITLE}>
        <PanelSkeleton label="Loading BCP status" lines={2} />
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title={PANEL_TITLE}>
        <ErrorState title="Status unavailable" error={error} onRetry={() => void refetch()} />
      </Panel>
    );
  }

  const view = describeStatus(data);
  const lightStyle = { '--light-color': `var(--mantine-color-${view.color}-5)` } as CSSProperties;
  return (
    <Panel title={PANEL_TITLE}>
      <Stack gap="xs">
        <Group gap="sm">
          <span className={classes.light} style={lightStyle} aria-hidden />
          <Badge color={view.color} variant="outline" size="lg" radius={0}>
            {view.label}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {view.description}
        </Text>
        {data.lastRefreshAt && (
          <Text size="xs" c="dimmed" className="numeric">
            Last refresh {formatDateTime(data.lastRefreshAt)}
          </Text>
        )}
      </Stack>
    </Panel>
  );
}
