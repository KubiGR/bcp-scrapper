import type { BcpStatus } from '@bcp/shared';
import { Alert, Badge, Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Panel } from '../../components/Panel';
import { formatDateTime } from '../../lib/format';
import { bcpStatusQuery } from './bcp-status-query';
import classes from './BcpStatusCard.module.css';

const PANEL_TITLE = 'BCP uplink';

interface StatusView {
  label: string;
  color: string;
  live: boolean;
  description: string;
}

function describeStatus(status: BcpStatus): StatusView {
  if (status.source === 'fixtures') {
    return {
      label: 'Offline · fixtures',
      color: 'gray',
      live: false,
      description:
        'Serving saved sample data. Set TOURNAMENT_SOURCE=bcp in .env to connect to Best Coast Pairings.',
    };
  }
  if (status.authenticated) {
    return {
      label: 'Connected',
      color: 'neon',
      live: true,
      description: status.accessTokenExpiresAt
        ? `Token valid until ${formatDateTime(status.accessTokenExpiresAt)}. It refreshes automatically.`
        : 'Token active. It refreshes automatically.',
    };
  }
  return {
    label: 'Not connected',
    color: 'red',
    live: false,
    description:
      'No valid BCP login. Add BCP_REFRESH_TOKEN to .env (see the README) and restart the API.',
  };
}

export function BcpStatusCard() {
  const { data, error, isPending, refetch } = useQuery(bcpStatusQuery);

  if (isPending) {
    return (
      <Panel title={PANEL_TITLE}>
        <Skeleton height={56} />
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title={PANEL_TITLE}>
        <Alert color="red" title="Status unavailable">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{error.message}</Text>
            <Button size="xs" color="red" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </Stack>
        </Alert>
      </Panel>
    );
  }

  const view = describeStatus(data);
  const lightStyle = { '--light-color': `var(--mantine-color-${view.color}-5)` } as CSSProperties;
  return (
    <Panel title={PANEL_TITLE}>
      <Stack gap="xs">
        <Group gap="sm">
          <span
            className={view.live ? `${classes.light} ${classes.pulse}` : classes.light}
            style={lightStyle}
            aria-hidden
          />
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
