import { parseSheetPaste } from '@bcp/shared';
import { Alert, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { planFromPaste, ratingsFromPaste, type SheetPlan } from './sheet-plan';

/**
 * Where the team's sheet is pasted: copy the ratings block (with the army and name headers around
 * it) and check what was found before using it. `onto` is a plan of an event's teams: then only
 * the chips are taken, each row and column going to the player with that army.
 */
export function PasteBox({ onUse, onto }: { onUse: (plan: SheetPlan) => void; onto?: SheetPlan }) {
  const [text, setText] = useState('');
  const paste = parseSheetPaste(text);
  const pasted = planFromPaste(paste);
  const matched = onto && pasted ? ratingsFromPaste(paste, onto) : null;
  const plan = onto && matched ? { ...onto, ratings: matched.ratings } : pasted;
  // What the paste itself holds (how many reached the event's players is said apart).
  const chips = pasted?.ratings.length ?? 0;
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
          {matched ? (
            <>
              <Text size="xs" c="dimmed">
                {matched.ratings.length} ratings matched by army to the event&apos;s players.
              </Text>
              {matched.unmatched.length > 0 && (
                <Alert color="yellow">
                  No player with these armies, so their games are left out:{' '}
                  {matched.unmatched.join(', ')}
                </Alert>
              )}
            </>
          ) : (
            <>
              <Text size="xs" c="dimmed">
                You: {armies(plan.ours)}
              </Text>
              <Text size="xs" c="dimmed">
                Them: {armies(plan.theirs)}
              </Text>
            </>
          )}
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
