import type { EventDetail } from '@bcp/shared';
import { Button, Menu } from '@mantine/core';
import { exportUrl } from './event-queries';

export function ExportMenu({ event }: { event: EventDetail }) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="sm" variant="outline" disabled={event.counts.listsFetched === 0}>
          Export lists
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component="a" href={exportUrl(event.bcpId, 'txt')} download>
          Download .txt
        </Menu.Item>
        <Menu.Item component="a" href={exportUrl(event.bcpId, 'json')} download>
          Download .json
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
