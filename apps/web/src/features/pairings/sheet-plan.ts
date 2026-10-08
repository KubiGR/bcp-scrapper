import {
  PAIRING_CHIPS,
  type PairingChip,
  type PairingRating,
  type PairingRosterPlayer,
  type SheetPaste,
} from '@bcp/shared';
import { z } from 'zod';

/** The planner's ratings, as pasted from the team's sheet (and changed here since). */
export interface SheetPlan {
  ours: PairingRosterPlayer[];
  theirs: PairingRosterPlayer[];
  ratings: PairingRating[];
}

const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  faction: z.string().nullable(),
  detachments: z.array(z.string()),
  list: z.string().nullable(),
});
const PlanSchema = z.object({
  ours: z.array(PlayerSchema).length(5),
  theirs: z.array(PlayerSchema).length(5),
  ratings: z.array(
    z.object({ playerId: z.string(), opponentPlayerId: z.string(), chip: z.enum(PAIRING_CHIPS) }),
  ),
});

const KEY = 'pairings:sheet-plan';

/** Players and ratings from a paste; null when it held no ratings. */
export function planFromPaste({ cells, ours, theirs }: SheetPaste): SheetPlan | null {
  if (!cells) return null;
  const player = (prefix: string) => (p: SheetPaste['ours'][number], i: number) => ({
    id: `${prefix}${String(i)}`,
    name: p.name ?? p.army,
    faction: p.army,
    detachments: [],
    list: p.list,
  });
  const plan = { ours: ours.map(player('us')), theirs: theirs.map(player('them')) };
  const ratings = cells.flatMap((row, i) =>
    row.flatMap((chip, j) =>
      chip === null
        ? []
        : [{ playerId: `us${String(i)}`, opponentPlayerId: `them${String(j)}`, chip }],
    ),
  );
  return { ...plan, ratings };
}

/** The plan with one game's chip changed (null clears it). */
export function ratePlan(
  plan: SheetPlan,
  playerId: string,
  opponentPlayerId: string,
  chip: PairingChip | null,
): SheetPlan {
  const rest = plan.ratings.filter(
    (r) => !(r.playerId === playerId && r.opponentPlayerId === opponentPlayerId),
  );
  return {
    ...plan,
    ratings: chip === null ? rest : [...rest, { playerId, opponentPlayerId, chip }],
  };
}

/** The last plan in this browser; null if none or unreadable (private window, cleared, old). */
export function readPlan(): SheetPlan | null {
  try {
    const parsed = PlanSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writePlan(plan: SheetPlan): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    // Storage blocked: the plan lasts until the page is closed.
  }
}
