import { Anchor, Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDuration } from '../../lib/format';
import { fetchQueueQuery } from './fetch-queue-queries';
import { QueueControls } from './QueueControls';
import classes from './QueueIndicator.module.css';

/**
 * "Fetching · 12 jobs · ~1 min · auto: 42 events left" in the header while there is anything to
 * show: the user's queued/fetching jobs, failed ones, automatic work (counted in events), or a
 * pause (so Resume stays reachable even once the queue drains).
 */
export function QueueIndicator() {
  const { data: state } = useQuery(fetchQueueQuery);
  if (!state) return null;
  const { queued, fetching, failed } = state.totals;
  const inProgress = queued + fetching;
  const autoEvents = state.auto.enabled ? state.auto.events : 0;
  if (inProgress === 0 && failed === 0 && autoEvents === 0 && !state.paused) return null;

  const loginExpired = state.pausedReason === 'login-rejected';
  const label = loginExpired
    ? 'Fetching paused: login expired'
    : [
        'Fetching',
        inProgress > 0 ? `${inProgress} job${inProgress === 1 ? '' : 's'}` : null,
        failed > 0 ? `${failed} failed` : null,
        state.paused
          ? 'paused'
          : state.estimatedSeconds !== null
            ? `~${formatDuration(state.estimatedSeconds)}`
            : null,
        autoEvents > 0 ? `auto: ${autoEvents} event${autoEvents === 1 ? '' : 's'} left` : null,
      ]
        .filter(Boolean)
        .join(' · ');
  // On a phone: one word, the rest in the popover.
  const word = loginExpired
    ? 'Login'
    : state.paused
      ? 'Paused'
      : inProgress === 0 && autoEvents === 0
        ? 'Failed'
        : 'Fetching';

  return (
    <Popover position="bottom-end" width={300} shadow="md">
      <Popover.Target>
        <UnstyledButton
          className={loginExpired ? classes.alert : classes.indicator}
          aria-label={label}
        >
          <span className={classes.full}>{label}</span>
          <span className={classes.short} data-short>
            {word}
          </span>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="xs" ff="monospace" className={classes.phoneOnly}>
            {label}
          </Text>
          <QueueControls state={state} />
          <Anchor component={Link} to="/queue" size="sm">
            Details: failures and what’s next
          </Anchor>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
