import type { PairingChip } from './scale';

/** One player in the pairings planner, from the team's sheet or the event. */
export interface PairingRosterPlayer {
  id: string;
  /** The player's name, when the sheet has it. */
  name: string;
  /** The army (as the sheet writes it). */
  faction: string | null;
  detachments: string[];
  /** The list, short (one unit per line), when known. */
  list: string | null;
  /** The army's disposition, e.g. "Take and Hold", when known (from the event). */
  disposition?: string | null;
}

/** Our player's chip against one of theirs. */
export interface PairingRating {
  playerId: string;
  opponentPlayerId: string;
  chip: PairingChip;
  /** What the game can become (the sheet's second chip), if anything. */
  alt?: PairingChip;
}
