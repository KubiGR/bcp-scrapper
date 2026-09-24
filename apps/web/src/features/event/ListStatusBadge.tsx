import type { ListStatus } from '@bcp/shared';
import { Badge, Text, Tooltip } from '@mantine/core';

export function ListStatusBadge({ status, error }: { status: ListStatus; error?: string | null }) {
  switch (status) {
    case 'fetched':
      return (
        <Badge size="sm" variant="light">
          Fetched
        </Badge>
      );
    case 'queued':
      return (
        <Badge size="sm" variant="outline">
          Queued
        </Badge>
      );
    case 'fetching':
      return (
        <Badge size="sm" variant="outline">
          Fetching
        </Badge>
      );
    case 'failed':
      return (
        <Tooltip label={error ?? 'Failed'} withArrow>
          <Badge size="sm" variant="outline" color="red" tabIndex={0}>
            Failed
          </Badge>
        </Tooltip>
      );
    case 'available':
      return (
        <Badge size="sm" variant="outline" color="gray">
          Not fetched
        </Badge>
      );
    case 'none':
      return (
        <Text size="xs" c="dimmed">
          No list
        </Text>
      );
  }
}
