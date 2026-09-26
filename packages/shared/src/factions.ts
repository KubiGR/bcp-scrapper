const ALLEGIANCES = new Set(
  [
    'Imperium',
    'Chaos',
    'Xenos',
    'Forces of the Imperium',
    'Forces of Chaos',
    'Forces of Xenos',
    'Forces of the Hive Mind',
  ].map((name) => name.toLowerCase()),
);

/** Allegiances a player can pick on BCP instead of an army; not factions. */
export function isAllegiance(faction: string): boolean {
  return ALLEGIANCES.has(faction.trim().toLowerCase());
}

/**
 * BCP's faction, or the army read from the player's list (a guess) when BCP has none or only an
 * allegiance.
 */
export function resolveFaction(
  bcpFaction: string | null,
  parsedArmy: string | null,
): { faction: string | null; factionGuessed: boolean } {
  const vague = bcpFaction === null || isAllegiance(bcpFaction);
  if (vague && parsedArmy !== null) return { faction: parsedArmy, factionGuessed: true };
  return { faction: bcpFaction, factionGuessed: false };
}
