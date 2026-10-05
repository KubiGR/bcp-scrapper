import { NO_KEYWORDS, type WeaponKeywords } from './weapons';

/** "SUSTAINED HITS 2: MONSTER/VEHICLE" → the ability and its condition. */
const CONDITION = /^(.*?)\s*:\s*(non-)?\s*([A-Za-z][A-Za-z /'-]*)$/i;
const ANTI = /^anti-?\s*(non-)?\s*(.+?)\s+([2-6])\+$/i;

const tidy = (name: string) => name.replace(/[‐‑–]/g, '-').replace(/\s+/g, ' ').trim();

/** Upper-case keywords from "MONSTER/VEHICLE". */
const keywordsOf = (text: string) =>
  text
    .split('/')
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k !== '');

/**
 * What a weapon's ability names (as 39k.pro writes them) do to the maths against a target with
 * these keywords. Conditional forms ("…: MONSTER/VEHICLE", "…: non-MONSTER/VEHICLE") apply only
 * when the target has (or lacks) one of them. Names that change no numbers (Hazardous, Pistol,
 * One Shot…) are left out.
 */
export function readKeywords(names: string[], targetKeywords: string[]): WeaponKeywords {
  const target = new Set(targetKeywords.map((k) => k.toUpperCase()));
  const has = (keywords: string[]) => keywords.some((k) => target.has(k));
  const out: WeaponKeywords = { ...NO_KEYWORDS, anti: [] };
  for (const raw of names) {
    let name = tidy(raw);
    const anti = ANTI.exec(name);
    if (anti !== null) {
      const keywords = keywordsOf(anti[2] ?? '');
      const value = Number(anti[3]);
      if (anti[1] === undefined) out.anti.push(...keywords.map((keyword) => ({ keyword, value })));
      else if (!has(keywords)) out.anti.push({ keyword: '*', value });
      continue;
    }
    const condition = CONDITION.exec(name);
    if (condition !== null) {
      const keywords = keywordsOf(condition[3] ?? '');
      const applies = condition[2] === undefined ? has(keywords) : !has(keywords);
      if (!applies) continue;
      name = condition[1] ?? '';
    }
    const lower = name.toLowerCase();
    const value = (pattern: RegExp) => pattern.exec(lower)?.[1];
    if (lower === 'lethal hits') out.lethalHits = true;
    else if (/^sustained hits( \S+)?$/.test(lower))
      out.sustainedHits = value(/^sustained hits (\S+)$/) ?? '1';
    else if (lower === 'devastating wounds') out.devastatingWounds = true;
    else if (lower === 'twin-linked' || lower === 'twin linked') out.twinLinked = true;
    else if (lower === 'torrent') out.torrent = true;
    else if (lower === 'heavy') out.heavy = true;
    else if (lower === 'lance') out.lance = true;
    else if (lower === 'ignores cover') out.ignoresCover = true;
    else if (lower === 'precision') out.precision = true;
    else if (lower === 'indirect fire') out.indirectFire = true;
    else if (/^rapid fire( \S+)?$/.test(lower))
      out.rapidFire = (value(/^rapid fire (\S+)$/) ?? '1').toUpperCase();
    else if (/^blast( \d+)?$/.test(lower)) out.blast = Number(value(/^blast (\d+)$/) ?? 1);
    else if (/^cleave( \d+)?$/.test(lower)) out.cleave = Number(value(/^cleave (\d+)$/) ?? 1);
    else if (/^melta \d+$/.test(lower)) out.melta = Number(value(/^melta (\d+)$/));
  }
  if (out.sustainedHits !== null) out.sustainedHits = out.sustainedHits.toUpperCase();
  return out;
}
