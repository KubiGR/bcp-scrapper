import type { Db } from '../db/client';
import { NotFoundError } from '../errors';
import { findEvent, type EventRow } from '../repo/events';

export async function requireEvent(db: Db, id: string): Promise<EventRow> {
  const row = await findEvent(db, id);
  if (!row) throw new NotFoundError(`Event ${id} is not in the local catalogue`);
  return row;
}
