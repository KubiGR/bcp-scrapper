import type { ListStatus } from '@bcp/shared';
import { Badge, Text } from '@mantine/core';

export function ListStatusBadge({ status }: { status: ListStatus }) {
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
        <Badge size="sm" variant="outline" color="red">
          Failed
        </Badge>
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
