/** The highest "X-n or better" a request may ask for. */
export const MAX_LOSSES_LIMIT = 20;

/**
 * "X-n or better": at most `maxLosses` losses. Draws are not losses (3-1-1 is X-1). A player
 * without recorded games has no result yet, so no result filter selects them.
 */
export function qualifiesForMaxLosses(
  player: { wins: number; losses: number; draws: number },
  maxLosses: number,
): boolean {
  const played = player.wins + player.losses + player.draws;
  return played > 0 && player.losses <= maxLosses;
}
