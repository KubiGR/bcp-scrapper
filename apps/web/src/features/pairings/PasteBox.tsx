import { parseSheetPaste } from '@bcp/shared';
import { Alert, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { planFromPaste, type SheetPlan } from './sheet-plan';

/**
 * Where the team's sheet is pasted: copy the ratings block (with the army and name headers around
 * it) and check what was found before using it.
 */
export function PasteBox({ onUse }: { onUse: (plan: SheetPlan) => void }) {
  const [text, setText] = useState('');
  const paste = parseSheetPaste(text);
  const plan = planFromPaste(paste);
  const chips = plan?.ratings.length ?? 0;
  const unreadable = paste.unreadable.length;
  const armies = (players: SheetPlan['ours']) => players.map((p) => p.faction).join(' · ');
  return (
    <Stack gap="sm">
      <Textarea
        label="Copied cells"
        description="In the sheet, select the ratings with the army rows above and the army column to the left (names and lists can come along), copy, and paste here."
        rows={5}
        value={text}
        onChange={(ev) => {
          setText(ev.currentTarget.value);
        }}
      />
      {text.trim() !== '' && !plan && (
        <Alert color="yellow">No ratings found: copy the cells with the chips (GG, G, Y…).</Alert>
      )}
      {plan && (
        <Stack gap={4}>
          <Text size="sm">
            {chips} chips · {25 - chips - unreadable} blank · {unreadable} unreadable
            {unreadable > 0 ? ' (left unrated)' : ''}
          </Text>
          <Text size="xs" c="dimmed">
            You: {armies(plan.ours)}
          </Text>
          <Text size="xs" c="dimmed">
            Them: {armies(plan.theirs)}
          </Text>
          <Group justify="flex-end">
            <Button
              onClick={() => {
                onUse(plan);
              }}
            >
              Use these ratings
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
