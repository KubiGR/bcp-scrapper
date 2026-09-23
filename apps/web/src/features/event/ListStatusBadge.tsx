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
