import { DETACHMENT_SEPARATOR, MAX_LOSSES_LIMIT, UNKNOWN_FILTER } from '@bcp/shared';
import { Drawer, Skeleton, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState';
import { ListDrawer } from '../event/ListDrawer';
import {
  FoundPlayerCards,
  FoundSortSelect,
  sortFound,
  type SortKey,
} from '../top-lists/FoundPlayers';
import { topListsQuery } from '../top-lists/top-lists-queries';
import { UNKNOWN_DETACHMENT, type PlayersFilter } from './FactionTable';
import type { MetaSearch } from './meta-queries';

interface MetaPlayersDrawerProps {
  filter: PlayersFilter | null;
  search: MetaSearch;
  onClose: () => void;
}

const titleOf = (filter: PlayersFilter) =>
  [
    filter.faction ?? 'Unknown faction',
    filter.detachments === undefined
      ? null
      : filter.detachments === null
        ? UNKNOWN_DETACHMENT
        : filter.detachments.join(' + '),
  ]
    .filter(Boolean)
    .join(' · ');

/** The players behind a Meta row, with their lists (the Top lists search, everyone with games). */
export function MetaPlayersDrawer({ filter, search, onClose }: MetaPlayersDrawerProps) {
  const [openKey, setOpenKey] = useState<{ eventId: string; bcpId: string } | null>(null);
  const players = useQuery({
    ...topListsQuery({
      factions: filter?.faction ?? UNKNOWN_FILTER,
      detachments:
        filter?.detachments === undefined
          ? undefined
          : filter.detachments === null
            ? UNKNOWN_FILTER
            : filter.detachments.join(DETACHMENT_SEPARATOR),
      from: search.from,
      to: search.to,
      // An archetype row counts players with exactly these detachments.
      detachmentsMatch: filter?.detachments ? 'exact' : undefined,
      type: search.type,
      // Everyone with games: the table counts every record.
      maxLosses: MAX_LOSSES_LIMIT,
    }),
    // Another row's players are other players: never show them while this row's load.
    placeholderData: undefined,
    enabled: filter !== null,
  });
  const found = players.data?.players ?? [];
  const [sortKey, setSortKey] = useState<SortKey>('record');
  const open =
    openKey === null
      ? null
      : (found.find((p) => p.eventId === openKey.eventId && p.bcpId === openKey.bcpId) ?? null);

  return (
    <Drawer
      opened={filter !== null}
      onClose={onClose}
      position="right"
      size="xl"
      title={filter === null ? '' : titleOf(filter)}
    >
      {players.isPending && <Skeleton height={200} />}
      {players.error && <ErrorState error={players.error} onRetry={() => void players.refetch()} />}
      {players.data && (
        <Stack gap="md">
          {players.data.truncated && (
            <Text size="sm" c="dimmed">
              Showing the first 500.
            </Text>
          )}
          <FoundSortSelect value={sortKey} onChange={setSortKey} />
          <FoundPlayerCards
            players={sortFound(found, sortKey)}
            sortKey={sortKey}
            onOpen={(player) => {
              setOpenKey({ eventId: player.eventId, bcpId: player.bcpId });
            }}
          />
        </Stack>
      )}
      <ListDrawer
        eventId={open?.eventId ?? ''}
        player={open}
        onClose={() => {
          setOpenKey(null);
        }}
      />
    </Drawer>
  );
}
