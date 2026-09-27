import type { ArchetypeRow, MetaRow, TeamArchetypeRow, TeamMetaRow } from './meta-schemas';

/** One counted player: their event, team, faction (resolved; null = unknown) and record. */
export interface MetaPlayerRow {
  eventId: string;
  isTeamEvent: boolean;
  teamId: string | null;
  teamPlacing: number | null;
  faction: string | null;
  /** From their current, read list; [] = unknown. */
  detachments: string[];
  wins: number;
  losses: number;
  draws: number;
}

const gamesOf = (row: MetaPlayerRow) => row.wins + row.losses + row.draws;
const archetypeKey = (detachments: string[] | null) => (detachments ?? []).join(' + ');
const nullsLast = <T>(a: T | null, b: T | null) => Number(a === null) - Number(b === null);
const byName = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '');

interface Group<T> {
  tally: T;
  archetypes: Map<string, { detachments: string[] | null; tally: T }>;
}

/** Groups rows by faction, then by archetype (faction + detachments). */
function groupRows<T>(
  rows: MetaPlayerRow[],
  empty: () => T,
  add: (tally: T, row: MetaPlayerRow) => void,
): Map<string | null, Group<T>> {
  const factions = new Map<string | null, Group<T>>();
  for (const row of rows) {
    const group: Group<T> = factions.get(row.faction) ?? {
      tally: empty(),
      archetypes: new Map<string, { detachments: string[] | null; tally: T }>(),
    };
    add(group.tally, row);
    const key = archetypeKey(row.detachments);
    const archetype = group.archetypes.get(key) ?? {
      detachments: row.detachments.length === 0 ? null : row.detachments,
      tally: empty(),
    };
    add(archetype.tally, row);
    group.archetypes.set(key, archetype);
    factions.set(row.faction, group);
  }
  return factions;
}

interface Tally {
  players: number;
  games: number;
  /** wins + ½ draws */
  points: number;
  x1: number;
}

const figures = (tally: Tally, total: number) => ({
  players: tally.players,
  share: total === 0 ? 0 : tally.players / total,
  games: tally.games,
  winRate: tally.games === 0 ? 0 : tally.points / tally.games,
  x1: tally.x1,
  x1Share: tally.players === 0 ? 0 : tally.x1 / tally.players,
});

/**
 * Popularity and results per faction (players, share of all counted players, win rate with draws
 * as half, X-1 or better), each split into archetypes. Players without games are left out.
 */
export function computeMeta(rows: MetaPlayerRow[]): {
  factions: MetaRow[];
  totals: { players: number; games: number };
} {
  const counted = rows.filter((row) => gamesOf(row) > 0);
  const total = counted.length;
  const groups = groupRows<Tally>(
    counted,
    () => ({ players: 0, games: 0, points: 0, x1: 0 }),
    (tally, row) => {
      tally.players += 1;
      tally.games += gamesOf(row);
      tally.points += row.wins + row.draws / 2;
      if (row.losses <= 1) tally.x1 += 1;
    },
  );
  const factions: MetaRow[] = [...groups.entries()]
    .map(([faction, group]) => ({
      faction,
      ...figures(group.tally, total),
      archetypes: [...group.archetypes.values()]
        .map((a): ArchetypeRow => ({ detachments: a.detachments, ...figures(a.tally, total) }))
        .sort(
          (x, y) =>
            nullsLast(x.detachments, y.detachments) ||
            y.players - x.players ||
            archetypeKey(x.detachments).localeCompare(archetypeKey(y.detachments)),
        ),
    }))
    .sort(
      (x, y) =>
        nullsLast(x.faction, y.faction) || y.players - x.players || byName(x.faction, y.faction),
    );
  return {
    factions,
    totals: { players: total, games: counted.reduce((sum, row) => sum + gamesOf(row), 0) },
  };
}

interface Slots {
  top: number;
  all: number;
}

/**
 * What top teams bring: per team event whose teams all have a placing, the teams placed in the
 * top quarter (rounded up) are "top"; each counted player is one slot. Per faction (and
 * archetype): slots in top teams and in all teams, their shares, and the difference. Null when no
 * team event counts.
 */
export function computeTeamMeta(
  rows: MetaPlayerRow[],
): { rows: TeamMetaRow[]; eventsCounted: number } | null {
  const byEvent = new Map<string, MetaPlayerRow[]>();
  for (const row of rows) {
    if (!row.isTeamEvent || row.teamId === null || gamesOf(row) === 0) continue;
    byEvent.set(row.eventId, [...(byEvent.get(row.eventId) ?? []), row]);
  }
  const slots: { row: MetaPlayerRow; top: boolean }[] = [];
  let eventsCounted = 0;
  for (const eventRows of byEvent.values()) {
    if (eventRows.some((row) => row.teamPlacing === null)) continue;
    const teams = new Set(eventRows.map((row) => row.teamId)).size;
    const cutoff = Math.ceil(teams * 0.25);
    for (const row of eventRows) slots.push({ row, top: (row.teamPlacing ?? Infinity) <= cutoff });
    eventsCounted += 1;
  }
  if (eventsCounted === 0) return null;

  const topTotal = slots.filter((slot) => slot.top).length;
  const allTotal = slots.length;
  const topRows = new Set(slots.filter((slot) => slot.top).map((slot) => slot.row));
  const groups = groupRows<Slots>(
    slots.map((slot) => slot.row),
    () => ({ top: 0, all: 0 }),
    (tally, row) => {
      tally.all += 1;
      if (topRows.has(row)) tally.top += 1;
    },
  );
  const shares = (tally: Slots) => {
    const topShare = topTotal === 0 ? 0 : tally.top / topTotal;
    const allShare = allTotal === 0 ? 0 : tally.all / allTotal;
    return {
      topSlots: tally.top,
      topShare,
      allSlots: tally.all,
      allShare,
      difference: topShare - allShare,
    };
  };
  const order = <T extends { difference: number; allSlots: number }>(x: T, y: T) =>
    y.difference - x.difference || y.allSlots - x.allSlots;
  const result: TeamMetaRow[] = [...groups.entries()]
    .map(([faction, group]) => ({
      faction,
      ...shares(group.tally),
      archetypes: [...group.archetypes.values()]
        .map((a): TeamArchetypeRow => ({ detachments: a.detachments, ...shares(a.tally) }))
        .sort(
          (x, y) =>
            order(x, y) || archetypeKey(x.detachments).localeCompare(archetypeKey(y.detachments)),
        ),
    }))
    .sort((x, y) => order(x, y) || byName(x.faction, y.faction));
  return { rows: result, eventsCounted };
}
