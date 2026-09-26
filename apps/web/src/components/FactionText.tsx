import { Text, Tooltip } from '@mantine/core';

export const GUESSED_ARMY_TOOLTIP = 'From the list — BCP has no army for this player';

/**
 * A player's faction. One read from their list (BCP had none, or only an allegiance) gets a ⚠ with
 * a tooltip, reachable by keyboard, since it's a guess.
 */
export function FactionText({ faction, guessed }: { faction: string | null; guessed: boolean }) {
  return (
    <>
      {faction ?? 'Unknown faction'}
      {guessed && (
        <Tooltip
          label={GUESSED_ARMY_TOOLTIP}
          withArrow
          events={{ hover: true, focus: true, touch: true }}
        >
          <Text
            component="span"
            inherit
            c="yellow.5"
            ml={4}
            tabIndex={0}
            aria-label="Guessed from the list"
          >
            ⚠
          </Text>
        </Tooltip>
      )}
    </>
  );
}
