import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { players } from '../db/schema';
import { saveArmyList } from '../repo/lists';

/** A GW-app list text (invented) with the given army, detachment line and disposition. */
export function gwList(army: string, detachment: string, disposition = 'Take and Hold'): string {
  return `Test List (2000 points)\n\n${army}\n${detachment} (3 Detachment Points)\n${disposition}\nStrike Force (2000 points)\n\nCaptain (80 points)`;
}

/**
 * Stores `text` as the player's current list (their list id is set to match); `bcpDetachment` is
 * the detachment the player picked on BCP (raw `warhammer.detachment`).
 */
export async function storeList(
  db: Db,
  playerId: string,
  text: string,
  bcpDetachment?: string,
): Promise<void> {
  const listId = `L-${playerId}`;
  await db.update(players).set({ listId }).where(eq(players.id, playerId));
  const raw = bcpDetachment === undefined ? {} : { warhammer: { detachment: bcpDetachment } };
  await saveArmyList(db, playerId, { bcpId: listId, text, raw });
}
