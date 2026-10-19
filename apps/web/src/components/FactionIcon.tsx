/** A faction's icon file name: its name in lower case, anything but letters and digits a dash. */
export const factionIconSlug = (faction: string) =>
  faction
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The factions with an icon in `public/factions` (Games Workshop's, from Hutber Stats). */
const ICONS = new Set([
  'adepta-sororitas',
  'adeptus-custodes',
  'adeptus-mechanicus',
  'aeldari',
  'astra-militarum',
  'black-templars',
  'blood-angels',
  'chaos-daemons',
  'chaos-knights',
  'chaos-space-marines',
  'dark-angels',
  'death-guard',
  'deathwatch',
  'drukhari',
  'emperor-s-children',
  'genestealer-cults',
  'grey-knights',
  'imperial-knights',
  'leagues-of-votann',
  'necrons',
  'orks',
  'space-marines-astartes',
  'space-wolves',
  't-au-empire',
  'thousand-sons',
  'tyranids',
  'world-eaters',
]);

/**
 * A faction's icon, before its name; nothing for a faction without one. Hidden from screen
 * readers: the name beside it says the same.
 */
export function FactionIcon({ faction, size = 16 }: { faction: string | null; size?: number }) {
  if (faction === null) return null;
  const slug = factionIconSlug(faction);
  if (!ICONS.has(slug)) return null;
  return (
    <img
      src={`/factions/${slug}.png`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      style={{ display: 'inline-block', verticalAlign: '-0.2em', marginRight: 4, flexShrink: 0 }}
    />
  );
}
