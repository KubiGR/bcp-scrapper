import type { DetachmentListsResponse } from '@bcp/shared';
import { Accordion, Anchor, Button, Code, Drawer, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { formatIsoDay } from '../../lib/format';
import { playerListQuery } from '../event/event-queries';
import { listLink } from '../event/ListDrawer';
import { detachmentListsQuery } from './detachment-names-queries';
import { PanelSkeleton } from '../../components/Skeletons';

type Found = DetachmentListsResponse['lists'][number];

/** One list's text, read when its row is opened. */
function ListText({ list }: { list: Found }) {
  const text = useQuery(playerListQuery(list.playerId));
  return (
    <Stack gap="xs">
      {text.isPending && <PanelSkeleton label="Loading the list" lines={6} />}
      {text.error && <ErrorState error={text.error} onRetry={() => void text.refetch()} />}
      {text.data && (
        <Code block style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>
          {text.data.text ?? 'This list has no text.'}
        </Code>
      )}
      <Anchor href={listLink(list.eventId, list.playerId)} target="_blank" size="sm">
        Open in its event ↗
      </Anchor>
    </Stack>
  );
}

function Lists({ name, faction }: { name: string; faction?: string }) {
  const found = useQuery(detachmentListsQuery(name, faction));
  if (found.isPending) return <PanelSkeleton label="Loading lists" lines={6} />;
  if (found.error) return <ErrorState error={found.error} onRetry={() => void found.refetch()} />;
  const { lists, total } = found.data;
  if (lists.length === 0) return <Text c="dimmed">No stored list uses it any more.</Text>;
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {lists.length < total
          ? `The newest ${String(lists.length)} of ${String(total)} lists`
          : `${String(total)} ${total === 1 ? 'list' : 'lists'}`}
      </Text>
      <Accordion variant="separated" chevronPosition="left">
        {lists.map((list) => (
          <Accordion.Item key={list.playerId} value={list.playerId}>
            <Accordion.Control>
              <Text size="sm">{list.playerName}</Text>
              <Text size="xs" c="dimmed">
                {[
                  list.faction,
                  list.eventName,
                  formatIsoDay(list.eventStartDate.slice(0, 10)),
                  list.detachments.join(' + '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <ListText list={list} />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}

/**
 * "See lists": the lists that use a detachment name (one faction's, when given), to read what the
 * players meant before linking or keeping it.
 */
export function DetachmentListsButton({ name, faction }: { name: string; faction?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="compact-xs"
        variant="subtle"
        color="gray"
        aria-label={`See lists using ${name}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        See lists
      </Button>
      <Drawer
        opened={open}
        onClose={() => {
          setOpen(false);
        }}
        position="right"
        size="lg"
        title={faction === undefined ? `Lists using “${name}”` : `${faction} lists using “${name}”`}
      >
        {open && <Lists name={name} faction={faction} />}
      </Drawer>
    </>
  );
}
