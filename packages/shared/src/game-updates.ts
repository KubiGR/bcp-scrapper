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
  name: string;
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

function nameOf(start: string, messages: string[]): string {
  const [year, month] = start.split('-');
  const kinds: string[] = [];
  const add = (kind: string) => {
    if (!kinds.includes(kind)) kinds.push(kind);
  };
  if (messages.some((m) => /mfm|munitorum/i.test(m))) add('MFM');
  if (messages.some((m) => /faction ?packs?/i.test(m))) add('Faction Packs');
  if (messages.some((m) => /dataslate|balance/i.test(m))) add('Dataslate');
  for (const message of messages) {
    const faction = codexFaction(message);
    if (faction !== null) add(`Codex: ${faction}`);
  }
  const label = `${MONTHS[Number(month) - 1] ?? ''} ${year ?? ''}`;
  return kinds.length === 0 ? label : `${label} · ${kinds.join(' & ')}`;
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
  return updates.flatMap(({ commits: group }) => {
    const first = group[0];
    const last = group.at(-1);
    if (first === undefined || last === undefined) return [];
    return [
      {
        id: first.sha,
        start: first.day,
        lastCommit: last.day,
        name: nameOf(
          first.day,
          group.map((c) => c.message),
        ),
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
});
export type GameUpdate = z.infer<typeof GameUpdateSchema>;

/** GET /api/updates: every update read from BSData, newest first. */
export const GameUpdatesResponseSchema = z.object({ updates: z.array(GameUpdateSchema) });
export type GameUpdatesResponse = z.infer<typeof GameUpdatesResponseSchema>;

/** PATCH /api/updates/:id: null name/start go back to BSData's. */
export const GameUpdatePatchSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  start: isoDay.nullable().optional(),
  merged: z.boolean().optional(),
  hidden: z.boolean().optional(),
});
export type GameUpdatePatch = z.infer<typeof GameUpdatePatchSchema>;
