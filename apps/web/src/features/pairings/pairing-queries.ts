import {
  PairingResponseSchema,
  PairingTeamsResponseSchema,
  SaveRatingResponseSchema,
  type PairingChip,
  type PairingResponse,
} from '@bcp/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '../../api/client';

const base = (eventId: string, teamId: string) =>
  `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(teamId)}/pairings`;

export const pairingTeamsQuery = (eventId: string, teamId: string) =>
  queryOptions({
    queryKey: ['pairings', eventId, teamId],
    queryFn: () => apiGet(base(eventId, teamId), PairingTeamsResponseSchema),
  });

/** Polls so teammates' ratings appear without a reload. */
export const pairingQuery = (eventId: string, teamId: string, opponentId: string) =>
  queryOptions({
    queryKey: ['pairings', eventId, teamId, opponentId],
    queryFn: () =>
      apiGet(`${base(eventId, teamId)}/${encodeURIComponent(opponentId)}`, PairingResponseSchema),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

/** Saves one cell at once; the page shows the new chip before the server answers. */
export function useSaveRating(eventId: string, teamId: string, opponentId: string) {
  const client = useQueryClient();
  const key = pairingQuery(eventId, teamId, opponentId).queryKey;
  return useMutation({
    mutationFn: ({
      playerId,
      opponentPlayerId,
      chip,
    }: {
      playerId: string;
      opponentPlayerId: string;
      chip: PairingChip | null;
    }) =>
      apiPut(
        `${base(eventId, teamId)}/${encodeURIComponent(opponentId)}/${encodeURIComponent(playerId)}/${encodeURIComponent(opponentPlayerId)}`,
        { chip },
        SaveRatingResponseSchema,
      ),
    onMutate: async ({ playerId, opponentPlayerId, chip }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<PairingResponse>(key);
      client.setQueryData<PairingResponse>(key, (data) => {
        if (!data) return data;
        const rest = data.ratings.filter(
          (r) => !(r.playerId === playerId && r.opponentPlayerId === opponentPlayerId),
        );
        return {
          ...data,
          ratings: chip === null ? rest : [...rest, { playerId, opponentPlayerId, chip }],
        };
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}
