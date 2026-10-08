import {
  CHIP_COLOURS,
  parseSheetPaste,
  type PairingChip,
  type PairingRosterPlayer,
} from '@bcp/shared';
import { Alert, Button, Group, Modal, NativeSelect, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import classes from './RatingsTable.module.css';

const SIZE = 5;
const darkText = new Set<PairingChip>(['BOUYA', 'Y', 'R']);
const inOrder = () => Array.from({ length: SIZE }, (_, i) => i);
const label = (p: PairingRosterPlayer) => `${p.faction ?? '—'} · ${p.name}`;

export interface PastedRating {
  playerId: string;
  opponentPlayerId: string;
  chip: PairingChip | null;
}

/**
 * Ratings copied from the team's Google Sheet: paste, check the preview and which app player each
 * sheet row and column is, then save all 25 games (blank and unreadable cells become unrated).
 */
export function PasteFromSheet({
  ours,
  theirs,
  onSave,
}: {
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  onSave: (ratings: PastedRating[]) => Promise<unknown>;
}) {
  const [opened, setOpened] = useState(false);
  const [text, setText] = useState('');
  const [rows, setRows] = useState(inOrder);
  const [cols, setCols] = useState(inOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpened(false);
    setText('');
    setRows(inOrder());
    setCols(inOrder());
    setError(null);
  };
  const { cells, unreadable } = parseSheetPaste(text, SIZE);
  const bad = new Set(unreadable.map(([i, j]) => `${i}|${j}`));
  const flat = cells?.flat() ?? [];
  const chips = flat.filter((c) => c !== null).length;
  const twice = new Set(rows).size < SIZE || new Set(cols).size < SIZE;

  const save = async () => {
    if (!cells) return;
    const list = cells.flatMap((row, i) =>
      row.map((chip, j) => ({
        playerId: ours[rows[i] ?? i]?.id ?? '',
        opponentPlayerId: theirs[cols[j] ?? j]?.id ?? '',
        chip,
      })),
    );
    setSaving(true);
    setError(null);
    try {
      await onSave(list);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const pick = (
    which: 'row' | 'column',
    index: number,
    players: PairingRosterPlayer[],
    map: number[],
    set: (next: number[]) => void,
  ) => (
    <NativeSelect
      aria-label={`Sheet ${which} ${index + 1}`}
      size="xs"
      value={players[map[index] ?? index]?.id ?? ''}
      onChange={(ev) => {
        const to = players.findIndex((p) => p.id === ev.currentTarget.value);
        set(map.map((v, k) => (k === index ? to : v)));
      }}
      data={players.map((p) => ({ value: p.id, label: label(p) }))}
    />
  );

  return (
    <>
      <Button
        variant="default"
        size="xs"
        onClick={() => {
          setOpened(true);
        }}
      >
        Paste from sheet
      </Button>
      <Modal opened={opened} onClose={close} title="Paste from sheet" size="auto">
        <Stack gap="sm">
          <Textarea
            label="Copied cells"
            description="Select the 5×5 ratings in the sheet (names and roles can come along), copy, and paste here."
            rows={5}
            value={text}
            onChange={(ev) => {
              setText(ev.currentTarget.value);
            }}
          />
          {text.trim() !== '' && !cells && (
            <Alert color="yellow">
              No ratings found: copy the cells with the chips (GG, G, Y…).
            </Alert>
          )}
          {cells && (
            <>
              <Text size="xs" c="dimmed">
                {chips} chips · {flat.length - chips - unreadable.length} blank ·{' '}
                {unreadable.length} unreadable (left unrated). Rows and columns are matched in
                order; change any that differ.
              </Text>
              <div style={{ overflowX: 'auto' }}>
                <table className={classes.table} aria-label="Pasted ratings">
                  <thead>
                    <tr>
                      <th />
                      {cells[0]?.map((_, j) => (
                        <th key={j}>{pick('column', j, theirs, cols, setCols)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cells.map((row, i) => (
                      <tr key={i}>
                        <th scope="row">{pick('row', i, ours, rows, setRows)}</th>
                        {row.map((chip, j) => {
                          const unread = bad.has(`${i}|${j}`);
                          return (
                            <td key={j}>
                              <div
                                className={
                                  chip ? classes.cell : `${classes.cell} ${classes.unrated}`
                                }
                                title={unread ? 'Unreadable: left unrated' : undefined}
                                style={
                                  chip
                                    ? {
                                        background: CHIP_COLOURS[chip],
                                        color: darkText.has(chip) ? '#111' : '#fff',
                                      }
                                    : unread
                                      ? { borderColor: 'var(--mantine-color-red-6)' }
                                      : undefined
                                }
                              >
                                {chip ?? (unread ? '?' : '–')}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {twice && (
                <Alert color="yellow">Each player can be matched once: fix the duplicate.</Alert>
              )}
            </>
          )}
          {error && <Alert color="red">Couldn’t save: {error}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!cells || twice}
              loading={saving}
              onClick={() => {
                void save();
              }}
            >
              Save 25 games
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
