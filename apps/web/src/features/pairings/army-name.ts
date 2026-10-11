import type { PairingRosterPlayer } from '@bcp/shared';

/** The short names players use for armies (keys: lower case, no bracket, plain apostrophe). */
const SHORT: Record<string, string> = {
  'adepta sororitas': 'Sisters',
  'adeptus custodes': 'Custodes',
  'adeptus mechanicus': 'AdMech',
  'astra militarum': 'AM',
  'black templars': 'BT',
  'blood angels': 'BA',
  'chaos daemons': 'Daemons',
  'chaos knights': 'CK',
  'chaos space marines': 'CSM',
  'dark angels': 'DA',
  'death guard': 'DG',
  deathwatch: 'DW',
  "emperor's children": 'EC',
  'genestealer cult': 'GSC',
  'genestealer cults': 'GSC',
  'grey knights': 'GK',
  'imperial agents': 'Agents',
  'imperial knights': 'IK',
  'leagues of votann': 'Votann',
  'space marines': 'SM',
  'space wolves': 'SW',
  "t'au empire": 'Tau',
  'thousand sons': 'TSons',
  tyranids: 'Nids',
  'world eaters': 'WE',
};

/** An army's short name ("Chaos Space Marines" → "CSM"); names without one stay as they are. */
export function shortArmy(name: string): string {
  const key = name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[’‘]/g, "'")
    .trim()
    .toLowerCase();
  return SHORT[key] ?? name;
}

/** A player's army as the pairings show it: short, or the player's name without an army. */
export const armyLabel = (p: PairingRosterPlayer | undefined) =>
  p?.faction ? shortArmy(p.faction) : (p?.name ?? '?');

/** A player's army in full, for screen readers and hovers. */
export const fullArmy = (p: PairingRosterPlayer | undefined) => p?.faction ?? p?.name ?? '?';
