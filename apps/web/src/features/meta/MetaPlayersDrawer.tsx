import { DETACHMENT_SEPARATOR, MAX_LOSSES_LIMIT, UNKNOWN_FILTER } from '@bcp/shared';
import { Button, Drawer, Skeleton, Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AnchorLink } from '../../components/AnchorLink';
import rowClasses from '../../components/ClickableRow.module.css';
import { ErrorState } from '../../components/ErrorState';
import { PlayerLine } from '../../components/PlayerLine';
import { HotCount, NewLeaf, playedLately } from '../../components/EventSymbols';
import { FieldElo } from '../../components/FieldElo';
import { listPath, openHere } from '../../lib/open-link';
import { formatEventSize, formatIsoDay } from '../../lib/format';
import { SortableTh, useTableSort } from '../../lib/table-sort';
import { FOUND_PLAYER_SORT, placingLine } from '../top-lists/player-sort';
import { ListDrawer } from '../event/ListDrawer';
import { formatRecord } from '../event/players-filter';
import { topListsQuery } from '../top-lists/top-lists-queries';
import { UNKNOWN_DETACHMENT, type PlayersFilter } from './FactionTable';
import type { MetaSearch } from './meta-queries';
import { PlayerName } from '../rankings/PlayerName';
import { RankBadge } from '../rankings/RankBadge';

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
  const { sorted, sort, toggle } = useTableSort(found, FOUND_PLAYER_SORT);
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
        <Stack gap="xs">
          {players.data.truncated && (
            <Text size="sm" c="dimmed">
              Showing the first 500.
            </Text>
          )}
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <SortableTh column="player" sort={sort} onSort={toggle}>
                  Player
                </SortableTh>
                <SortableTh column="event" sort={sort} onSort={toggle}>
                  Event
                </SortableTh>
                <SortableTh column="record" sort={sort} onSort={toggle} ta="right">
                  W-L-D
                </SortableTh>
                <Table.Th aria-label="List" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map((player) => (
                <Table.Tr
                  key={`${player.eventId}:${player.bcpId}`}
                  className={rowClasses.row}
                  onClick={(e) => {
                    // Links and buttons in the row do their own thing.
                    if (e.target instanceof Element && e.target.closest('a, button')) return;
                    setOpenKey({ eventId: player.eventId, bcpId: player.bcpId });
                  }}
                >
                  <Table.Td>
                    <Text size="sm">
                      <PlayerName name={player.name} userId={player.bcpUserId} />
                      <RankBadge userId={player.bcpUserId} />
                    </Text>
                    {placingLine(player) !== null && (
                      <Text size="xs" c="dimmed" className="numeric">
                        {placingLine(player)}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed">
                      <PlayerLine {...player} />
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <AnchorLink
                      to="/events/$eventId"
                      params={{ eventId: player.eventId }}
                      search={{ tab: 'players' }}
                    >
                      {player.eventName}
                    </AnchorLink>
                    {playedLately(player.eventStartDate) && <NewLeaf />}
                    <Text size="xs" c="dimmed" className="numeric">
                      {formatIsoDay(player.eventStartDate.slice(0, 10))} ·{' '}
                      <HotCount playerCount={player.eventPlayerCount}>
                        {formatEventSize({
                          playerCount: player.eventPlayerCount,
                          teamCount: player.eventTeamCount,
                        })}
                      </HotCount>
                      {player.eventFieldElo !== null && (
                        <>
                          {' · '}
                          <FieldElo elo={player.eventFieldElo} />
                        </>
                      )}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" className="numeric">
                    {formatRecord(player)}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Button
                      component="a"
                      href={listPath(player.eventId, player.bcpId)}
                      size="xs"
                      variant="light"
                      onClick={openHere(() => {
                        setOpenKey({ eventId: player.eventId, bcpId: player.bcpId });
                      })}
                    >
                      List
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
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
