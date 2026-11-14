/** Matching a list's detachment name to the known detachments, whatever its spelling. */

/** Lower-case, no accents, apostrophes or hyphens, single spaces: names compare in this form. */
export const looseDetachmentKey = (name: string) => loose(name);
const loose = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`-]/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/ s\b/g, 's');

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length] ?? 0;
}

/**
 * The candidate a list's detachment name means: the same name, the same ignoring case, spacing,
 * accents, apostrophes and hyphens, the last words of exactly one candidate ("Oathband"), or
 * (8+ letters) at most 2 letters off with a single closest candidate; else null.
 */
export function matchDetachment(
  name: string,
  candidates: readonly string[],
  /** `fuzzy: false`: exact and loose matches only (no last words, no typos). */
  options: { fuzzy?: boolean } = {},
): string | null {
  if (candidates.includes(name)) return name;
  const key = loose(name);
  if (key === '') return null;
  const exactLoose = candidates.filter((candidate) => loose(candidate) === key);
  if (exactLoose.length === 1) return exactLoose[0] ?? null;
  if (options.fuzzy === false) return null;
  const letters = key.replace(/ /g, '').length;
  if (letters >= 6) {
    const ending = candidates.filter((candidate) => loose(candidate).endsWith(` ${key}`));
    if (ending.length === 1) return ending[0] ?? null;
  }
  if (letters < 8) return null;
  const scored = candidates
    .map((candidate) => ({ candidate, d: distance(key, loose(candidate)) }))
    .filter((entry) => entry.d <= 2)
    .sort((a, b) => a.d - b.d);
  const [best, next] = scored;
  if (best === undefined || next?.d === best.d) return null;
  return best.candidate;
}
