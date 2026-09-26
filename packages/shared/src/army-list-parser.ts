/** Bump when the parser changes: stored lists with an older version are re-read on startup. */
export const PARSER_VERSION = 1;

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
const DETACHMENT_LINE = /^(.+?)\s*\((\d{1,2})\s+[^\d()]+\)\s*$/;
/** A title or battle-size line: `(2000 points)`, `(2,000 Points)`, `(2.000 puntos)`. */
const POINTS_LINE = /\(\s*\d[\d.,]{2,}\s*[^\d()]*\)\s*$/;

/**
 * The detachment line is followed, within two lines, by the battle size ("Strike Force (2000
 * points)"), which keeps a unit line like "Captain (80 pts)" in free text from matching.
 */
const isDetachmentAt = (lines: string[], i: number) =>
  DETACHMENT_LINE.test(lines[i] ?? '') &&
  [lines[i + 1], lines[i + 2]].some((line) => line !== undefined && POINTS_LINE.test(line));

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
  const detachment = DETACHMENT_LINE.exec(lines[at] ?? '')?.[1]?.trim() ?? '';
  const next = lines[at + 1]?.trim() ?? '';
  return {
    army: block[0] ?? null,
    detachments: detachment === '' ? [] : [detachment],
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

/** `A, B (enhancements…)` → ['A', 'B']. */
const commaList = (value: string | null) =>
  (value ?? '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/** `+ FACTION KEYWORD: Imperium - Grey Knights` / `+ DETACHMENT: …` / `+ FORCE DISPOSITION: …`. */
function header(lines: string[]): ParsedList | null {
  const keyword = field(lines, /^\+\s*FACTION KEYWORD:\s*(.+)$/i);
  if (keyword === null) return null;
  const army = keyword.split(' - ').at(-1)?.trim() ?? '';
  return {
    army: army === '' ? null : army,
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
    army: army === '' ? null : army,
    detachments: commaList(field(lines, /^\s*Detachments?(?: used)?(?:\(s\))?:\s*(.+)$/i)),
    disposition: knownDisposition(field(lines, /^\s*(?:Force )?Disposition:\s*(.+)$/i)),
    format: 'template',
  };
}

/** Army, detachments and disposition from a list's text; never guesses from free text. */
export function parseArmyList(text: string | null): ParsedList {
  if (text === null || text.trim() === '') return UNKNOWN;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return gwApp(lines) ?? header(lines) ?? template(lines) ?? UNKNOWN;
}

const JOINERS = /\s*,\s*|\s+(?:and|y|und|et|e)\s+/;

/** Splits one joined detachment name when every part is a detachment seen on its own. */
export function splitDetachments(detachments: string[], known: ReadonlySet<string>): string[] {
  const [only] = detachments;
  if (detachments.length !== 1 || only === undefined) return detachments;
  const parts = only
    .split(JOINERS)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 && parts.every((part) => known.has(part)) ? parts : detachments;
}
