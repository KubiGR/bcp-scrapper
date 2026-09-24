import type { MantineColor } from '@mantine/core';

/**
 * A fixed colour per disposition (BCP's subFaction, e.g. "Take and Hold"), matched
 * case-insensitively and trimmed. Unknown or new dispositions fall back to gray.
 */
const DISPOSITION_COLORS: Record<string, MantineColor> = {
  'take and hold': 'green',
  'priority assets': 'orange',
  'purge the foe': 'red',
  reconnaissance: 'teal',
  disruption: 'grape',
};

export function dispositionColor(disposition: string): MantineColor {
  return DISPOSITION_COLORS[disposition.trim().toLocaleLowerCase()] ?? 'gray';
}
