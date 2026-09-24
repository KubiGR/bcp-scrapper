import { Text } from '@mantine/core';
import { dispositionColor } from '../lib/dispositions';

/**
 * A player's disposition (BCP's subFaction, e.g. "Take and Hold") as coloured inline text, sized
 * to match its surroundings. The name is always shown as text, so colour is never the only
 * signal. Renders nothing for null; callers show "—" where a cell needs one.
 */
export function DispositionText({ disposition }: { disposition: string | null }) {
  if (disposition === null) return null;
  const color = dispositionColor(disposition);
  return (
    <Text component="span" inherit fw={500} c={`${color}.4`}>
      {disposition}
    </Text>
  );
}
