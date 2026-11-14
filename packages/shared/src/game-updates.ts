import { z } from 'zod';
import { addDays } from './catalog';
import { canonicalArmy } from './factions';

export interface UpdateCommit {
  sha: string;
  /** The commit's UTC day (YYYY-MM-DD). */
  day: string;
  /** Its message's first line. */
  message: string;
}
/** An update as BSData's history shows it: a burst of update commits. */
export interface AutoUpdate {
  /** The sha of its first commit: stable as history grows. */
  id: string;
  start: string;
  lastCommit: string;
  /** A generated name, distinct from the other updates'. */
  name: string;
  /** The factions its commits touched, most first ("" when none are named). */
  summary: string;
  /** Other generated names to pick from (the name first). */
  suggestions: string[];
}
export interface UpdateEdits {
  name: string | null;
  start: string | null;
  merged: boolean;
  hidden: boolean;
}
export interface EffectiveUpdate {
  id: string;
  name: string;
  start: string;
}
export interface UpdateSpan extends EffectiveUpdate {
  from: string;
  to: string;
}

const UPDATE_COMMIT = /mfm|munitorum|faction ?packs?|dataslate|balance|codex/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A commit for an official update (points, Faction Packs, Dataslate, a codex), not a fix. */
export const isUpdateCommit = (message: string) => UPDATE_COMMIT.test(message);

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/** The faction a "Codex: X …" message names, if it's a faction the app knows. */
function codexFaction(message: string): string | null {
  const match = /codex:?\s+([a-z' -]+)/i.exec(message);
  if (match?.[1] === undefined) return null;
  const words =
    match[1]
      .split(/\s+(?:and|&|\+)\s+|,/i)[0]
      ?.trim()
      .split(/\s+/) ?? [];
  for (let n = Math.min(words.length, 4); n > 0; n -= 1) {
    const faction = canonicalArmy(words.slice(0, n).join(' '));
    if (faction !== null) return faction;
  }
  return null;
}

const ROMAN = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const SEASONS = [
  'Winter',
  'Winter',
  'Spring',
  'Spring',
  'Spring',
  'Summer',
  'Summer',
  'Summer',
  'Autumn',
  'Autumn',
  'Autumn',
  'Winter',
];
/** Short names commit messages use for factions (capitals only, so "WE" isn't "we"). */
const ABBREVIATIONS: Record<string, string> = {
  AM: 'Astra Militarum',
  GK: 'Grey Knights',
  GSC: 'Genestealer Cult',
  IK: 'Imperial Knights',
  CK: 'Chaos Knights',
  SM: 'Space Marines (Astartes)',
  CSM: 'Chaos Space Marines',
  DG: 'Death Guard',
  TS: 'Thousand Sons',
  EC: "Emperor's Children",
  WE: 'World Eaters',
  BA: 'Blood Angels',
  DA: 'Dark Angels',
  SW: 'Space Wolves',
  BT: 'Black Templars',
  DW: 'Deathwatch',
};
const LOOSE_ABBREVIATIONS: Record<string, string> = {
  tau: "T'au Empire",
  admech: 'Adeptus Mechanicus',
  sisters: 'Adepta Sororitas',
  custodes: 'Adeptus Custodes',
  nids: 'Tyranids',
};

/** The factions a commit message names (each once). */
function factionsIn(message: string): string[] {
  const words = message.split(/[^A-Za-z'’-]+/).filter(Boolean);
  const found = new Set<string>();
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? '';
    const short = ABBREVIATIONS[word] ?? LOOSE_ABBREVIATIONS[word.toLowerCase()];
    if (short !== undefined) {
      found.add(short);
      continue;
    }
    for (let n = 3; n >= 1; n -= 1) {
      const faction = canonicalArmy(words.slice(i, i + n).join(' '));
      if (faction !== null) {
        found.add(faction);
        i += n - 1;
        break;
      }
    }
  }
  return [...found];
}

/** How many commits name each faction, most first (then A→Z). */
function factionCounts(messages: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const message of messages) {
    for (const faction of factionsIn(message)) counts.set(faction, (counts.get(faction) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** "Astra Militarum, Orks +2 more": the factions an update touched, most first. */
function summaryOf(messages: string[]): string {
  const factions = factionCounts(messages).map(([faction]) => faction);
  const shown = factions.slice(0, 6).join(', ');
  return factions.length > 6 ? `${shown} +${String(factions.length - 6)} more` : shown;
}

/** "Late Summer 2026": the season of a day, early/late for its first/last month. */
function seasonOf(day: string): string {
  const [year, month] = day.split('-');
  const m = Number(month) - 1;
  const season = SEASONS[m] ?? '';
  const prev = SEASONS[(m + 11) % 12];
  const next = SEASONS[(m + 1) % 12];
  const part = prev !== season ? 'Early ' : next !== season ? 'Late ' : '';
  return `${part}${season} ${year ?? ''}`;
}

/** What most of an update's commits changed: points, Faction Packs, a Dataslate. */
function kindOf(messages: string[]): string {
  if (messages.some((m) => /dataslate|balance/i.test(m))) return 'Dataslate';
  const points = messages.filter((m) => /mfm|munitorum/i.test(m)).length;
  const packs = messages.filter((m) => /faction ?packs?/i.test(m)).length;
  if (points > packs) return 'points';
  return packs > 0 ? 'Faction Packs' : 'update';
}

/**
 * Names an update could have, the best first: the edition's launch, its codexes, an official
 * version, a faction most of it is about, then its season and what changed.
 */
function nameCandidates(start: string, messages: string[], index: number): string[] {
  const [year, month] = start.split('-');
  const monthYear = `${MONTHS[Number(month) - 1] ?? ''} ${year ?? ''}`;
  const candidates: string[] = [];
  if (index === 0) candidates.push('Edition launch');
  const codexes = [...new Set(messages.flatMap((m) => codexFaction(m) ?? []))];
  if (codexes.length === 1) candidates.push(`Codex: ${codexes[0] ?? ''}`);
  if (codexes.length > 1) candidates.push(`Codexes: ${codexes.join(' & ')}`);
  const versions = messages.flatMap((m) => {
    const match = /\bmfm\s*v?(\d+(?:\.\d+)+)/i.exec(m);
    return match?.[1] === undefined ? [] : [match[1]];
  });
  const version = versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (version !== undefined) candidates.push(`MFM ${version}`);
  const counts = factionCounts(messages);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  const [top, second] = counts;
  // Half or more of the faction mentions, and clearly ahead of the next faction.
  if (top !== undefined && total >= 2 && top[1] * 2 >= total && (second?.[1] ?? 0) < top[1]) {
    candidates.push(`${top[0]} shake-up`);
  }
  candidates.push(`${seasonOf(start)} ${kindOf(messages)}`);
  if (top !== undefined && !candidates.includes(`${top[0]} shake-up`)) {
    candidates.push(`${top[0]}${counts.length > 1 ? ' & friends' : ''} · ${monthYear}`);
  }
  candidates.push(`Update ${String(index + 1)} · ${monthYear}`);
  return candidates;
}

/** Update commits less than `gapDays` apart form one update; oldest first. */
export function groupUpdates(commits: UpdateCommit[], gapDays = 7): AutoUpdate[] {
  const updates: { commits: UpdateCommit[] }[] = [];
  const sorted = commits
    .filter((c) => isUpdateCommit(c.message))
    // By day, then sha: the same first commit (an update's id) whatever order they're read in.
    .sort((a, b) => a.day.localeCompare(b.day) || a.sha.localeCompare(b.sha));
  for (const commit of sorted) {
    const current = updates.at(-1);
    const last = current?.commits.at(-1);
    if (
      current !== undefined &&
      last !== undefined &&
      dayNumber(commit.day) - dayNumber(last.day) < gapDays
    ) {
      current.commits.push(commit);
    } else {
      updates.push({ commits: [commit] });
    }
  }
  const used = new Map<string, number>();
  return updates.flatMap(({ commits: group }, index) => {
    const first = group[0];
    const last = group.at(-1);
    if (first === undefined || last === undefined) return [];
    const names = nameCandidates(
      first.day,
      group.map((c) => c.message),
      index,
    );
    // A name already given to an earlier update gets "II", "III"…
    const base = names[0] ?? first.day;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const name = seen === 0 ? base : `${base} ${ROMAN[seen] ?? String(seen + 1)}`;
    return [
      {
        id: first.sha,
        start: first.day,
        lastCommit: last.day,
        name,
        summary: summaryOf(group.map((c) => c.message)),
        suggestions: [...new Set([name, ...names])],
      },
    ];
  });
}

/** The updates people pick from: edits applied, merged and hidden ones left out; oldest first. */
export function effectiveUpdates(
  auto: AutoUpdate[],
  edits: Map<string, UpdateEdits>,
): EffectiveUpdate[] {
  return auto
    .flatMap((update) => {
      const edit = edits.get(update.id);
      if (edit?.merged === true || edit?.hidden === true) return [];
      return [
        { id: update.id, name: edit?.name ?? update.name, start: edit?.start ?? update.start },
      ];
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** The update in force on a day: the last one starting on or before it; null before the first. */
export function updateOfDay(updates: EffectiveUpdate[], day: string): EffectiveUpdate | null {
  let found: EffectiveUpdate | null = null;
  for (const update of updates) if (update.start <= day) found = update;
  return found;
}

/** A range's start when none is given: the start of the update in force on its last day, else 90 days back. */
export function defaultRangeFrom(updates: EffectiveUpdate[], to: string): string {
  return updateOfDay(updates, to)?.start ?? addDays(to, -90);
}

/** Each update's days: to the day before the next one, the newest to today (never before its start). */
export function updateSpans(updates: EffectiveUpdate[], today: string): UpdateSpan[] {
  return updates.map((update, index) => {
    const next = updates[index + 1];
    const to = next === undefined ? today : addDays(next.start, -1);
    return { ...update, from: update.start, to: to < update.start ? update.start : to };
  });
}

/** The date range of the picked updates: earliest start to latest end (updates between included). */
export function selectionRange(
  spans: UpdateSpan[],
  ids: string[],
): { from: string; to: string } | null {
  const picked = spans.filter((span) => ids.includes(span.id));
  const first = picked[0];
  const last = picked.at(-1);
  return first === undefined || last === undefined ? null : { from: first.from, to: last.to };
}

/** The run of updates a range covers exactly; none when it doesn't line up with update days. */
export function selectedUpdates(spans: UpdateSpan[], from: string, to: string): string[] {
  const start = spans.findIndex((span) => span.from === from);
  const end = spans.findIndex((span) => span.to === to);
  if (start < 0 || end < start) return [];
  return spans.slice(start, end + 1).map((span) => span.id);
}

const isoDay = z.iso.date();

export const GameUpdateSchema = z.object({
  id: z.string(),
  name: z.string(),
  autoName: z.string(),
  start: isoDay,
  autoStart: isoDay,
  merged: z.boolean(),
  hidden: z.boolean(),
  /** Stored events whose first day falls in this update's days (0 when merged or hidden). */
  events: z.number().int().nonnegative(),
  /** The factions its BSData commits touched, most first ("" when none are named). */
  summary: z.string(),
  /** Added by an admin (since BSData's takedown), not read from BSData; only these are deleted. */
  added: z.boolean(),
  /** Generated names to pick from when renaming (the generated name first). */
  suggestions: z.array(z.string()),
});
export type GameUpdate = z.infer<typeof GameUpdateSchema>;

/** GET /api/updates: every update (read from BSData or added by hand), newest first. */
export const GameUpdatesResponseSchema = z.object({ updates: z.array(GameUpdateSchema) });
export type GameUpdatesResponse = z.infer<typeof GameUpdatesResponseSchema>;

/** POST /api/updates: an update added by hand, e.g. a new Balance Dataslate. */
export const GameUpdateCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  start: isoDay,
});
export type GameUpdateCreate = z.infer<typeof GameUpdateCreateSchema>;

/** PATCH /api/updates/:id: null name/start go back to the update's own. */
export const GameUpdatePatchSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  start: isoDay.nullable().optional(),
  merged: z.boolean().optional(),
  hidden: z.boolean().optional(),
});
export type GameUpdatePatch = z.infer<typeof GameUpdatePatchSchema>;
