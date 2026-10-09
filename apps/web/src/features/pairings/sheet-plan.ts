import {
  canonicalArmy,
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
  /** Where the players came from when picked from an event (absent when pasted). */
  source?: PlanSource;
}

/** An event's two teams, as picked. */
export interface PlanSource {
  event: string;
  team: string;
  opponent: string;
  /** Names to show while it's on screen. */
  eventName?: string;
  teamName?: string;
  opponentName?: string;
}

const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  faction: z.string().nullable(),
  detachments: z.array(z.string()),
  list: z.string().nullable(),
  disposition: z.string().nullable().optional(),
});
const PlanSchema = z.object({
  ours: z.array(PlayerSchema).length(5),
  theirs: z.array(PlayerSchema).length(5),
  source: z
    .object({
      event: z.string(),
      team: z.string(),
      opponent: z.string(),
      eventName: z.string().optional(),
      teamName: z.string().optional(),
      opponentName: z.string().optional(),
    })
    .optional(),
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

const SAVED = 'pairings:event-plans';
/** How many event pairings are kept (the most recent first). */
const KEEP = 20;
const sourceKey = (source: PlanSource) => `${source.event}|${source.team}|${source.opponent}`;

/** The plan on screen; one picked from an event is also kept for that pairing. */
export function writePlan(plan: SheetPlan): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
    const source = plan.source;
    if (!source) return;
    const saved = readSaved().filter(([key]) => key !== sourceKey(source));
    localStorage.setItem(
      SAVED,
      JSON.stringify([[sourceKey(source), plan], ...saved].slice(0, KEEP)),
    );
  } catch {
    // Storage blocked: the plan lasts until the page is closed.
  }
}

function readSaved(): [string, unknown][] {
  try {
    const parsed = z
      .array(z.tuple([z.string(), z.unknown()]))
      .safeParse(JSON.parse(localStorage.getItem(SAVED) ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/** The plan kept for this pairing of an event's teams (its ratings), if any. */
export function savedPlan(source: PlanSource): SheetPlan | null {
  const found = readSaved().find(([key]) => key === sourceKey(source));
  const parsed = PlanSchema.safeParse(found?.[1]);
  return parsed.success ? parsed.data : null;
}

/**
 * A pasted sheet's chips onto players picked from an event: each row and column goes to the
 * player with that army (the sheet's labels), whatever the order; a paste without labels goes by
 * position. Armies with no player of their own are named in `unmatched`, their games left out.
 */
export function ratingsFromPaste(
  paste: SheetPaste,
  plan: SheetPlan,
): { ratings: PairingRating[]; unmatched: string[] } {
  const unmatched: string[] = [];
  const key = (army: string | null) =>
    army ? (canonicalArmy(army) ?? army.trim().toLowerCase()) : '';
  const match = (labels: SheetPaste['ours'], players: PairingRosterPlayer[], fallback: string) => {
    const taken = new Set<string>();
    return labels.map((label, i) => {
      if (label.army === `${fallback} ${String(i + 1)}`) return players[i]?.id ?? null;
      const player = players.find((p) => !taken.has(p.id) && key(p.faction) === key(label.army));
      if (!player) {
        unmatched.push(label.army);
        return null;
      }
      taken.add(player.id);
      return player.id;
    });
  };
  const rows = match(paste.ours, plan.ours, 'Player');
  const cols = match(paste.theirs, plan.theirs, 'Opponent');
  const ratings = (paste.cells ?? []).flatMap((row, i) =>
    row.flatMap((chip, j): PairingRating[] => {
      const playerId = rows[i];
      const opponentPlayerId = cols[j];
      if (chip === null || !playerId || !opponentPlayerId) return [];
      const alt = paste.alts?.[i]?.[j] ?? null;
      const rating = { playerId, opponentPlayerId, chip };
      return [alt ? { ...rating, alt } : rating];
    }),
  );
  return { ratings, unmatched };
}
