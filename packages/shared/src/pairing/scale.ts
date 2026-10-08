/** The rating chips, best first, as the team's sheet uses them. */
export const PAIRING_CHIPS = ['BOUYA', 'GG', 'G', 'Y', 'R', 'RR', 'F'] as const;
export type PairingChip = (typeof PAIRING_CHIPS)[number];

/** Points out of 20 for our player; F (either way) counts as even. */
export const CHIP_POINTS: Record<PairingChip, number> = {
  BOUYA: 20,
  GG: 17,
  G: 13,
  Y: 10,
  R: 7,
  RR: 2.5,
  F: 10,
};

export const CHIP_COLOURS: Record<PairingChip, string> = {
  BOUYA: '#00e5ff',
  GG: '#1155cc',
  G: '#38761d',
  Y: '#ffd966',
  R: '#e69138',
  RR: '#cc0000',
  F: '#674ea7',
};

/** A game nobody has rated yet counts as even. */
export const UNRATED_POINTS = 10;

/** The ratings as points, ours (rows) against theirs (columns), and how many games are rated. */
export function pointsMatrix(
  ourIds: string[],
  theirIds: string[],
  ratings: { playerId: string; opponentPlayerId: string; chip: PairingChip }[],
): { points: number[][]; rated: number } {
  const byPair = new Map(ratings.map((r) => [`${r.playerId}|${r.opponentPlayerId}`, r.chip]));
  let rated = 0;
  const points = ourIds.map((o) =>
    theirIds.map((t) => {
      const chip = byPair.get(`${o}|${t}`);
      if (chip === undefined) return UNRATED_POINTS;
      rated += 1;
      return CHIP_POINTS[chip];
    }),
  );
  return { points, rated };
}
