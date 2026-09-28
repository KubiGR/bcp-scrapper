/**
 * Small words of the languages lists are usually written in besides English (Spanish, French,
 * German, Italian) that never appear in an English detachment name.
 */
const FOREIGN_WORDS = new Set([
  'de',
  'del',
  'en',
  'la',
  'las',
  'los',
  'el',
  'y',
  'con',
  'du',
  'des',
  'les',
  'et',
  'der',
  'das',
  'und',
  'von',
  'della',
  'di',
]);

/**
 * Whether a detachment name looks like it isn't English: a letter outside the English alphabet
 * (Armería, 王朝之手) or a small foreign word (Cabalgata del Caos). A stray `Â` — a mangled space
 * — doesn't count. Names without such clues ("Arrazadorez") need marking by hand.
 */
export function looksForeign(name: string): boolean {
  if (/(?![A-Za-zÂ])\p{L}/u.test(name)) return true;
  return name
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((word) => FOREIGN_WORDS.has(word));
}
