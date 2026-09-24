import { Popover, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { formatDuration } from '../../lib/format';
import { fetchQueueQuery } from './fetch-queue-queries';
import { QueueControls } from './QueueControls';
import classes from './QueueIndicator.module.css';

/**
 * "Lists · 34 queued · ~3 min" in the header while there is anything to show: queued/fetching
 * lists, failed ones, or a pause (so Resume stays reachable even once the queue drains).
 */
export function QueueIndicator() {
  const { data: state } = useQuery(fetchQueueQuery);
  if (!state) return null;
  const { queued, fetching, failed } = state.totals;
  const inProgress = queued + fetching;
  if (inProgress === 0 && failed === 0 && !state.paused) return null;

  const loginExpired = state.pausedReason === 'login-rejected';
  const label = loginExpired
    ? 'Lists paused: login expired'
    : [
        'Lists',
        inProgress > 0 ? `${inProgress} queued` : null,
        failed > 0 ? `${failed} failed` : null,
        state.paused
          ? 'paused'
          : state.estimatedSeconds !== null
            ? `~${formatDuration(state.estimatedSeconds)}`
            : null,
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <Popover position="bottom-end" width={300} shadow="md">
      <Popover.Target>
        <UnstyledButton className={loginExpired ? classes.alert : classes.indicator}>
          {label}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <QueueControls state={state} />
      </Popover.Dropdown>
    </Popover>
  );
}
