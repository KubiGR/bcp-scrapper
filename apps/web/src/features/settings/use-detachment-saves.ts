import { cleanDetachmentName, type DetachmentNamesResponse } from '@bcp/shared';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  detachmentNamesQuery,
  keepDetachment,
  linkDetachment,
  unkeepDetachment,
  unlinkDetachment,
} from './detachment-names-queries';

export interface LinkRequest {
  name: string;
  target: string | null;
  foreign: boolean;
  ignored?: boolean;
}

interface DetachmentPair {
  faction: string;
  name: string;
}

export type DetachmentEdit =
  | ({ type: 'link' } & LinkRequest)
  | { type: 'unlink'; name: string }
  | ({ type: 'keep'; ignored: boolean } & DetachmentPair)
  | ({ type: 'unkeep' } & DetachmentPair);

const mutationKey = ['detachment-names-save'];
const nameKey = (name: string) => cleanDetachmentName(name).toLowerCase();
const pairKey = (pair: DetachmentPair) => JSON.stringify([pair.faction, nameKey(pair.name)]);

/** Hide the rows being acted on. The server supplies any new rows and corrected counts. */
export function detachmentNamesWithPending(
  data: DetachmentNamesResponse,
  pending: DetachmentEdit[],
): DetachmentNamesResponse {
  if (pending.length === 0) return data;
  const links = new Set(pending.filter((edit) => edit.type === 'link').map((e) => nameKey(e.name)));
  const unlinks = new Set(
    pending.filter((edit) => edit.type === 'unlink').map((e) => nameKey(e.name)),
  );
  const keeps = new Set(pending.filter((edit) => edit.type === 'keep').map(pairKey));
  const unkeeps = new Set(pending.filter((edit) => edit.type === 'unkeep').map(pairKey));
  const remains = ({ name }: { name: string }) => !links.has(nameKey(name));
  const staysLinked = ({ name }: { name: string }) => !unlinks.has(nameKey(name));
  return {
    ...data,
    unsure: data.unsure.filter(remains),
    foreign: data.foreign.filter((entry) => remains(entry) && staysLinked(entry)),
    ignored: data.ignored.filter(staysLinked),
    learned: data.learned.filter(remains),
    links: data.links.filter(staysLinked),
    wrong: data.wrong.filter((pair) => !keeps.has(pairKey(pair))),
    kept: data.kept.filter((pair) => !unkeeps.has(pairKey(pair))),
  };
}

function save(edit: DetachmentEdit) {
  switch (edit.type) {
    case 'link':
      return linkDetachment(edit.name, edit.target, edit.foreign, edit.ignored);
    case 'unlink':
      return unlinkDetachment(edit.name);
    case 'keep':
      return keepDetachment(edit.faction, edit.name, edit.ignored);
    case 'unkeep':
      return unkeepDetachment(edit.faction, edit.name);
  }
}

export function useDetachmentSaves() {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<string[]>([]);
  const { mutate: enqueue } = useMutation({
    mutationKey,
    // Each write can retidy lists and returns the full snapshot, so only send one at a time.
    scope: { id: 'detachment-names' },
    mutationFn: save,
    onSuccess: async (data) => {
      await queryClient.cancelQueries({ queryKey: detachmentNamesQuery.queryKey });
      queryClient.setQueryData(detachmentNamesQuery.queryKey, data);
    },
    onError: (error, edit) => {
      setErrors((previous) => [...previous, `Couldn’t save ${edit.name}. ${error.message}`]);
    },
    onSettled: (_data, error) => {
      // The current mutation is still counted here. Refresh dependent views once per batch.
      if (queryClient.isMutating({ mutationKey }) !== 1) return;
      void queryClient.invalidateQueries({
        predicate: (query) =>
          error !== null || query.queryKey[0] !== detachmentNamesQuery.queryKey[0],
      });
    },
  });
  const pending = useMutationState({
    filters: { mutationKey, status: 'pending' },
    select: (mutation) => mutation.state.variables as DetachmentEdit,
  });
  return {
    enqueue,
    pending,
    errors,
    clearErrors: () => {
      setErrors([]);
    },
  };
}
