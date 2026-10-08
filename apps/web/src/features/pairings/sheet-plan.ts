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
    z.object({
      playerId: z.string(),
      opponentPlayerId: z.string(),
      chip: z.enum(PAIRING_CHIPS),
      alt: z.enum(PAIRING_CHIPS).optional(),
    }),
  ),
});

const KEY = 'pairings:sheet-plan';

/** Players and ratings from a paste; null when it held no ratings. */
export function planFromPaste({ cells, alts, ours, theirs }: SheetPaste): SheetPlan | null {
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
    row.flatMap((chip, j): PairingRating[] => {
      if (chip === null) return [];
      const alt = alts?.[i]?.[j] ?? null;
      const rating = { playerId: `us${String(i)}`, opponentPlayerId: `them${String(j)}`, chip };
      return [alt ? { ...rating, alt } : rating];
    }),
  );
  return { ...plan, ratings };
}

const same = (r: PairingRating, playerId: string, opponentPlayerId: string) =>
  r.playerId === playerId && r.opponentPlayerId === opponentPlayerId;

/** The plan with one game's chip changed (null clears the game); what it can become stays. */
export function ratePlan(
  plan: SheetPlan,
  playerId: string,
  opponentPlayerId: string,
  chip: PairingChip | null,
): SheetPlan {
  const old = plan.ratings.find((r) => same(r, playerId, opponentPlayerId));
  const rest = plan.ratings.filter((r) => !same(r, playerId, opponentPlayerId));
  if (chip === null) return { ...plan, ratings: rest };
  const rating = { playerId, opponentPlayerId, chip };
  return { ...plan, ratings: [...rest, old?.alt ? { ...rating, alt: old.alt } : rating] };
}

/** The plan with what one rated game can become changed (null: nothing). */
export function altPlan(
  plan: SheetPlan,
  playerId: string,
  opponentPlayerId: string,
  alt: PairingChip | null,
): SheetPlan {
  return {
    ...plan,
    ratings: plan.ratings.map((r) => {
      if (!same(r, playerId, opponentPlayerId)) return r;
      const plain = { playerId, opponentPlayerId, chip: r.chip };
      return alt ? { ...plain, alt } : plain;
    }),
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
