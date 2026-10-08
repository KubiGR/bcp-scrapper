import type { PairingChip } from './scale';

/** One player in the pairings planner, as read from the team's sheet. */
export interface PairingRosterPlayer {
  id: string;
  /** The player's name, when the sheet has it. */
  name: string;
  /** The army (as the sheet writes it). */
  faction: string | null;
  detachments: string[];
  /** The list text, when the sheet has it. */
  list: string | null;
}

/** Our player's chip against one of theirs. */
export interface PairingRating {
  playerId: string;
  opponentPlayerId: string;
  chip: PairingChip;
}
