import type { MathhammerList } from '@bcp/shared';
import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SearchSelect } from '../../components/SearchSelect';
import { pickableUnits } from './datasheet-form';
import { readList, storedListQuery, storedListsQuery } from './mathhammer-queries';

/** Names a list unit and its attached characters couldn't read, each once. */
const unreadOf = (list: MathhammerList, index: number) => [
  ...new Set(
    [index, ...list.units.flatMap((u, i) => (u.attachedTo === index ? [i] : []))].flatMap(
      (i) => list.units[i]?.unread ?? [],
    ),
  ),
];

/** The list last read for a side, kept in this browser. */
const storageKey = (label: string) => `mathhammer:list:${label}`;
function savedList(label: string): string {
  try {
    return localStorage.getItem(storageKey(label)) ?? '';
  } catch {
    return '';
  }
}
/** Whether a side has a list remembered: it then opens on it. */
export const hasSavedList = (label: string) => savedList(label).trim() !== '';
function saveList(label: string, text: string) {
  try {
    localStorage.setItem(storageKey(label), text);
  } catch {
    // Private mode or storage off: the list just isn't remembered.
  }
}

/**
 * Picks a unit from an army list: pasted (GW app or NewRecruit export) or a stored BCP list found
 * by player or event. "Use" fills the side. The pasted list is remembered in this browser.
 */
export function ListPicker({
  label,
  onPick,
}: {
  label: string;
  onPick: (list: MathhammerList, index: number) => void;
}) {
  const [from, setFrom] = useState<'paste' | 'bcp'>('paste');
  const [text, setText] = useState(() => savedList(label));
  // The text read (the saved one comes back read).
  const [readText, setReadText] = useState(text);
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [unitIndex, setUnitIndex] = useState<string | null>(null);
  const pasted = useQuery({
    queryKey: ['mathhammer', 'read-list', readText],
    queryFn: () => readList(readText),
    enabled: readText.trim() !== '',
    staleTime: Infinity,
    retry: false,
  });
  const found = useQuery(storedListsQuery(debounced));
  const stored = useQuery({ ...storedListQuery(playerId ?? ''), enabled: playerId !== null });
  const list = from === 'paste' ? pasted.data : stored.data;
  const error = from === 'paste' ? pasted.error : (stored.error ?? found.error);
  const units = list ? pickableUnits(list) : [];
  const index = unitIndex === null ? null : Number(unitIndex);
  const unread = list && index !== null ? unreadOf(list, index) : [];
  const notFound = list?.units.filter((u) => u.datasheetId === null).map((u) => u.name) ?? [];

  return (
    <Stack gap="xs">
      <SegmentedControl
        size="xs"
        aria-label={`${label} list source`}
        data={[
          { value: 'paste', label: 'Paste' },
          { value: 'bcp', label: 'Pick from BCP' },
        ]}
        value={from}
        onChange={(value) => {
          setFrom(value === 'bcp' ? 'bcp' : 'paste');
          setUnitIndex(null);
        }}
      />
      {from === 'paste' ? (
        <Group gap="xs" align="flex-end">
          <Textarea
            size="xs"
            label={`${label} list`}
            placeholder="Paste a list from the GW app or NewRecruit"
            rows={4}
            w={360}
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
            }}
          />
          <Button
            size="xs"
            loading={pasted.isFetching}
            disabled={text.trim() === ''}
            onClick={() => {
              setUnitIndex(null);
              setReadText(text);
              saveList(label, text);
              // The same text again: read it again.
              if (text === readText) void pasted.refetch();
            }}
          >
            Read list
          </Button>
        </Group>
      ) : (
        <Group gap="xs" align="flex-end">
          <TextInput
            size="xs"
            label={`${label} BCP list`}
            placeholder="Player or event"
            w={200}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
            }}
          />
          {(found.data?.lists.length ?? 0) > 0 ? (
            <SearchSelect
              size="xs"
              label={`${label} stored list`}
              w={360}
              data={(found.data?.lists ?? []).map((l) => ({
                value: l.playerId,
                label: `${l.player} · ${l.event}${l.faction === null ? '' : ` · ${l.faction}`}`,
              }))}
              value={playerId}
              onChange={(value) => {
                setPlayerId(value);
                setUnitIndex(null);
              }}
            />
          ) : (
            debounced.trim().length >= 2 &&
            found.data !== undefined && (
              <Text size="xs" c="dimmed">
                No lists found
              </Text>
            )
          )}
        </Group>
      )}
      {error && (
        <Alert color="red" role="alert">
          {error.message}
        </Alert>
      )}
      {list && units.length === 0 && (
        <Text size="sm" c="dimmed">
          No units found in this list
        </Text>
      )}
      {units.length > 0 && (
        <Group gap="xs" align="flex-end">
          <SearchSelect
            size="xs"
            label={`${label} list unit`}
            w={360}
            data={units.map((u) => ({ value: String(u.index), label: u.label }))}
            value={unitIndex}
            onChange={setUnitIndex}
          />
          <Button
            size="xs"
            disabled={index === null || list === undefined}
            onClick={() => {
              if (list !== undefined && index !== null) onPick(list, index);
            }}
          >
            Use
          </Button>
        </Group>
      )}
      {unread.length > 0 && (
        <Text size="xs" c="dimmed">{`Couldn’t read: ${unread.join(', ')}`}</Text>
      )}
      {notFound.length > 0 && (
        <Text size="xs" c="dimmed">{`Couldn’t read: ${notFound.join(', ')}`}</Text>
      )}
    </Stack>
  );
}
