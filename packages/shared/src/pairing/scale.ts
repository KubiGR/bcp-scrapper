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

/** How much a game's "can become" chip counts (the sheet's second chip); the first chip has the rest. */
export const CAN_BECOME_WEIGHT = 1 / 3;

/** A game's points: its chip, or mostly its chip and partly the one it can become. */
export function ratingPoints(chip: PairingChip, alt?: PairingChip | null): number {
  return alt
    ? (1 - CAN_BECOME_WEIGHT) * CHIP_POINTS[chip] + CAN_BECOME_WEIGHT * CHIP_POINTS[alt]
    : CHIP_POINTS[chip];
}

/** A game nobody has rated yet counts as even. */
export const UNRATED_POINTS = 10;

/** The ratings as points, ours (rows) against theirs (columns), and how many games are rated. */
export function pointsMatrix(
  ourIds: string[],
  theirIds: string[],
  ratings: { playerId: string; opponentPlayerId: string; chip: PairingChip; alt?: PairingChip }[],
): { points: number[][]; rated: number } {
  const byPair = new Map(ratings.map((r) => [`${r.playerId}|${r.opponentPlayerId}`, r]));
  let rated = 0;
  const points = ourIds.map((o) =>
    theirIds.map((t) => {
      const rating = byPair.get(`${o}|${t}`);
      if (rating === undefined) return UNRATED_POINTS;
      rated += 1;
      return ratingPoints(rating.chip, rating.alt);
    }),
  );
  return { points, rated };
}
