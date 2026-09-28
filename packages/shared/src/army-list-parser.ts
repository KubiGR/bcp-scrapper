import { canonicalArmy } from './factions';

/** Bump when the parser changes: stored lists with an older version are re-read on startup. */
export const PARSER_VERSION = 5;

/** What a list says about the army; only these three things are ever read from list text. */
export interface ParsedList {
  army: string | null;
  /** One entry per detachment; a GW-app line naming several stays joined (see splitDetachments). */
  detachments: string[];
  /** One of the five known dispositions, in English; anything else is null. */
  disposition: string | null;
  format: 'gw-app' | 'header' | 'template' | 'unknown';
}

export const KNOWN_DISPOSITIONS = [
  'Take and Hold',
  'Priority Assets',
  'Purge the Foe',
  'Reconnaissance',
  'Disruption',
] as const;

/** The canonical English disposition for `value` (any case), or null when it isn't one. */
export function knownDisposition(value: string | null): string | null {
  if (value === null) return null;
  const wanted = value.trim().toLowerCase();
  return KNOWN_DISPOSITIONS.find((name) => name.toLowerCase() === wanted) ?? null;
}

const UNKNOWN: ParsedList = { army: null, detachments: [], disposition: null, format: 'unknown' };

/** `Name (3 Detachment Points)` / `(3 puntos de destacamento)`: a small number, then words. */
const DETACHMENT_LINE = /^(.+?)\s*\((\d{1,2})\s+([^\d()]+)\)\s*$/;
/** A unit's cost, `(45 pts)`, or a stratagem's, `(2 CP)`: never a detachment line. */
const UNIT_POINTS = /^(?:pts|points?|punkte|puntos|pkt|cp|command points?)\.?$/i;
/** A title or battle-size line: `(2000 points)`, `(2,000 Points)`, `(2.000 puntos)` (1000+). */
const POINTS_LINE = /\(\s*\d[.,]?\d{3}\s*[^\d()]*\)\s*$/;

/** Chapters the GW app writes under "Space Marines" that BCP lists as factions of their own. */
const OWN_FACTION_CHAPTERS = new Set([
  'Dark Angels',
  'Blood Angels',
  'Space Wolves',
  'Black Templars',
  'Deathwatch',
]);

/** The army as BCP names the faction, or null when the name isn't a known faction. */
const cleanArmy = (name: string) => canonicalArmy(name);

/**
 * The detachment line is followed, within two lines, by the battle size ("Strike Force (2000
 * points)"), which keeps a unit line like "Captain (80 pts)" in free text from matching.
 */
const isDetachmentAt = (lines: string[], i: number) => {
  const match = DETACHMENT_LINE.exec(lines[i] ?? '');
  return (
    match !== null &&
    !UNIT_POINTS.test(match[3]?.trim() ?? '') &&
    [lines[i + 1], lines[i + 2]].some((line) => line !== undefined && POINTS_LINE.test(line))
  );
};

/** The GW app export: [title] / blank / army / [sub-army] / detachment / disposition / size. */
function gwApp(lines: string[]): ParsedList | null {
  const at = lines.findIndex((_, i) => isDetachmentAt(lines, i));
  if (at < 1) return null;
  // The contiguous non-empty block ending at the detachment line: [title] army [sub-army].
  let start = at;
  while (start > 0 && lines[start - 1]?.trim() !== '') start -= 1;
  const block = lines.slice(start, at).map((line) => line.trim());
  if (block[0] !== undefined && POINTS_LINE.test(block[0])) block.shift();
  if (block.length === 0 || block.length > 2) return null;
  // Army lines are plain names: a unit "(45 pts)" or a heading "Attached Units:" means this
  // isn't the GW-app header.
  if (block.some((line) => line.includes('(') || line.endsWith(':'))) return null;
  const [first = '', second] = block;
  // Two lines are army + sub-army, or a title without points + army: take the known faction.
  const army =
    first === 'Space Marines' && second !== undefined && OWN_FACTION_CHAPTERS.has(second)
      ? second
      : (block.find((line) => cleanArmy(line) !== null) ?? first);
  const detachment = DETACHMENT_LINE.exec(lines[at] ?? '')?.[1]?.trim() ?? '';
  const next = lines[at + 1]?.trim() ?? '';
  return {
    army: cleanArmy(army),
    detachments: detachment === '' ? [] : [cleanDetachmentName(detachment)],
    disposition: next.includes('(') ? null : knownDisposition(next),
    format: 'gw-app',
  };
}

function field(lines: string[], pattern: RegExp): string | null {
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match?.[1] !== undefined) return match[1].trim();
  }
  return null;
}

/** Every bracketed part, nested ones included: `A (x (y)), B (z)` → `A, B`. */
function withoutBrackets(value: string): string {
  let text = value;
  while (/\([^()]*\)/.test(text)) text = text.replace(/\s*\([^()]*\)/g, '');
  return text;
}

/** `A (enhancements…), B` → ['A', 'B']. */
const commaList = (value: string | null) =>
  withoutBrackets(value ?? '')
    .split(',')
    .map(cleanDetachmentName)
    .filter(Boolean);

/** One line: `Name - Army - Disposition - Detachment, Detachment (2000 Points)`; name optional. */
function oneLine(lines: string[]): ParsedList | null {
  for (const line of lines) {
    if (!POINTS_LINE.test(line)) continue;
    const parts = line.replace(POINTS_LINE, '').split(/\s+-\s+|^\s*-\s+/);
    if (parts.length < 4) continue;
    const [army, disposition, detachments] = parts.slice(-3);
    const known = knownDisposition(disposition ?? null);
    if (known === null || army === undefined || army.trim() === '') continue;
    return {
      army: cleanArmy(army),
      detachments: commaList(detachments ?? null),
      disposition: known,
      format: 'header',
    };
  }
  return null;
}

/** `+ FACTION KEYWORD: Imperium - Grey Knights` / `+ DETACHMENT: …` / `+ FORCE DISPOSITION: …`. */
function header(lines: string[]): ParsedList | null {
  const keyword = field(lines, /^\+\s*FACTION KEYWORD:\s*(.+)$/i);
  if (keyword === null) return null;
  const army = keyword.split(' - ').at(-1)?.trim() ?? '';
  return {
    army: army === '' ? null : cleanArmy(army),
    detachments: commaList(field(lines, /^\+\s*DETACHMENT:\s*(.+)$/i)),
    disposition: knownDisposition(field(lines, /^\+\s*FORCE DISPOSITION:\s*(.+)$/i)),
    format: 'header',
  };
}

/** `Factions used: …` / `Detachment(s): …` / `Disposition: …`. */
function template(lines: string[]): ParsedList | null {
  const at = lines.findIndex((line) => /^\s*Factions? used:/i.test(line));
  if (at < 0) return null;
  // The army is on the same line or the first non-empty line after it; multi-faction lists name
  // the main army first.
  const inline = lines[at]?.replace(/^\s*Factions? used:/i, '').trim() ?? '';
  const first =
    inline !== '' ? inline : (lines.slice(at + 1).find((line) => line.trim() !== '') ?? '');
  const army = first.split(',')[0]?.trim() ?? '';
  return {
    army: army === '' ? null : cleanArmy(army),
    detachments: commaList(field(lines, /^\s*Detachments?(?: used)?(?:\(s\))?:\s*(.+)$/i)),
    disposition: knownDisposition(field(lines, /^\s*(?:Force )?Disposition:\s*(.+)$/i)),
    format: 'template',
  };
}

/** Army, detachments and disposition from a list's text; never guesses from free text. */
export function parseArmyList(text: string | null): ParsedList {
  if (text === null || text.trim() === '') return UNKNOWN;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return gwApp(lines) ?? oneLine(lines) ?? header(lines) ?? template(lines) ?? UNKNOWN;
}

/** Commas always separate detachments (no name has one), also before a last "and". */
const COMMA = /\s*,\s*(?:(?:and|y|und|et|e)\s+)?/;
/** Words that join detachments on a GW-app line, but can also be part of one name. */
const WORD_JOINER = /(\s+(?:and|y|und|et|e)\s+)/;

/** A detachment name with every kind of space collapsed and straight apostrophes. */
export function cleanDetachmentName(name: string): string {
  return (
    name
      // A non-breaking space garbled on the way (UTF-8 read as Latin-1): "Â" + the space.
      .replace(/\u00c2\u00a0/g, ' ')
      .replace(/[\u2010\u2011]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** The names a joined detachment line lists ("A, B and C" → A, B, C); one name stays one. */
export function detachmentParts(name: string): string[] {
  return name
    .split(COMMA)
    .flatMap((part) => part.split(WORD_JOINER).filter((_, index) => index % 2 === 0))
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Groups a comma-free piece's words-joined parts ("A and B and C") into names: the grouping with
 * the most known names wins, then the one with fewest names, so "Legends of Saga and Song and Saga
 * of the Great Wolf" keeps "Legends of Saga and Song" whole.
 */
function segment(piece: string, isKnown: (name: string) => boolean): string[] {
  const tokens = piece.split(WORD_JOINER); // [part, joiner, part, joiner, part…]
  const parts = tokens.filter((_, index) => index % 2 === 0);
  const joinerAfter = (index: number) => tokens[index * 2 + 1] ?? ' ';
  const best: ({ known: number; names: string[] } | undefined)[] = [];
  best[parts.length] = { known: 0, names: [] };
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    let group = '';
    for (let j = i; j < parts.length; j += 1) {
      group = j === i ? (parts[i] ?? '') : `${group}${joinerAfter(j - 1)}${parts[j] ?? ''}`;
      const rest = best[j + 1];
      if (rest === undefined) continue;
      const candidate = {
        known: rest.known + (isKnown(group.trim()) ? 1 : 0),
        names: [group.trim(), ...rest.names],
      };
      const current = best[i];
      if (
        current === undefined ||
        candidate.known > current.known ||
        (candidate.known === current.known && candidate.names.length < current.names.length)
      ) {
        best[i] = candidate;
      }
    }
  }
  return best[0]?.names ?? [piece];
}

/**
 * Splits one joined detachment line: always on commas; on "and"/"y"/"und"/… only where that gives
 * more known detachments (case ignored), so a single name containing "and" stays whole.
 */
export function splitDetachments(detachments: string[], known: ReadonlySet<string>): string[] {
  const [only] = detachments;
  if (detachments.length !== 1 || only === undefined) return detachments;
  const lowerKnown = new Set([...known].map((name) => name.toLowerCase()));
  const isKnown = (name: string) => lowerKnown.has(name.toLowerCase());
  const names = only
    .split(COMMA)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((piece) => segment(piece, isKnown));
  return names.length > 1 ? names : detachments;
}
