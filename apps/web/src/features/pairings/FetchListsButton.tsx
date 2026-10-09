import { Button, Group, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { playerListQuery, playersQuery } from '../event/event-queries';
import { queueLists } from '../fetch-queue/fetch-queue-api';
import { planFromEvent } from './event-plan';
import type { SheetPlan } from './sheet-plan';

/** How often to look again while lists are being fetched, and for how long at most. */
const POLL_MS = 2000;
const MAX_POLLS = 150;
const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * For teams picked from an event: fetch both teams' missing lists, wait for them, then bring the
 * players up to date (short lists, detachments, dispositions). The ratings stay.
 */
export function FetchListsButton({
  plan,
  onRefresh,
}: {
  plan: SheetPlan;
  onRefresh: (plan: SheetPlan) => void;
}) {
  const source = plan.source;
  const client = useQueryClient();
  const [left, setLeft] = useState<number | null>(null);
  const refresh = useMutation({
    mutationFn: async (): Promise<SheetPlan | null> => {
      if (!source) return null;
      await queueLists(source.event, { teamIds: [source.team, source.opponent] });
      let players = await client.query({ ...playersQuery(source.event), staleTime: 0 });
      const ofTeams = () =>
        players.items.filter(
          (p) => !p.dropped && (p.teamId === source.team || p.teamId === source.opponent),
        );
      for (let poll = 0; poll < MAX_POLLS; poll += 1) {
        const busy = ofTeams().filter(
          (p) => p.listStatus === 'queued' || p.listStatus === 'fetching',
        ).length;
        setLeft(busy);
        if (busy === 0) break;
        await sleep(POLL_MS);
        players = await client.query({ ...playersQuery(source.event), staleTime: 0 });
      }
      const texts = await Promise.all(
        ofTeams()
          .filter((p) => p.listStatus === 'fetched')
          .map((p) =>
            client
              .query({ ...playerListQuery(p.bcpId), staleTime: 0 })
              .then((list) => [p.bcpId, list.text] as const)
              .catch(() => [p.bcpId, null] as const),
          ),
      );
      const fresh = planFromEvent(
        players.items,
        new Map(texts),
        source.team,
        source.opponent,
        source.event,
      );
      return { ...fresh, ratings: plan.ratings, source };
    },
    onSuccess: (fresh) => {
      if (fresh) onRefresh(fresh);
    },
    onSettled: () => {
      setLeft(null);
    },
  });

  if (!source) return null;
  return (
    <Group gap={6}>
      {refresh.isPending && left !== null && left > 0 && (
        <Text size="xs" c="dimmed">
          Fetching lists… {String(left)} left
        </Text>
      )}
      {refresh.error && (
        <Text size="xs" c="red">
          Couldn’t fetch the lists: {refresh.error.message}
        </Text>
      )}
      <Button
        variant="default"
        size="xs"
        loading={refresh.isPending}
        onClick={() => {
          refresh.mutate();
        }}
      >
        Fetch lists
      </Button>
    </Group>
  );
}
