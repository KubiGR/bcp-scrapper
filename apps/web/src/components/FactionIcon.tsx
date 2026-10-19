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

/** Other names a faction goes by (BCP's, BSData's, Hutber's), by slug: the icon they share. */
const ALIASES: Record<string, string> = {
  'genestealer-cult': 'genestealer-cults',
  'space-marines': 'space-marines-astartes',
  'adeptus-astartes': 'space-marines-astartes',
  asuryani: 'aeldari',
  craftworlds: 'aeldari',
  'heretic-astartes': 'chaos-space-marines',
  'legiones-daemonica': 'chaos-daemons',
  tau: 't-au-empire',
};

/** The icon's file name for a faction, or null when there's none. */
function iconOf(faction: string): string | null {
  const slug = factionIconSlug(faction);
  const icon = ALIASES[slug] ?? slug;
  return ICONS.has(icon) ? icon : null;
}

/** Whether there's an icon for the faction. */
export const hasFactionIcon = (faction: string) => iconOf(faction) !== null;

/**
 * A faction's icon, before its name; nothing for a faction without one. Hidden from screen
 * readers: the name beside it says the same.
 */
export function FactionIcon({ faction, size = 22 }: { faction: string | null; size?: number }) {
  if (faction === null) return null;
  const slug = iconOf(faction);
  if (slug === null) return null;
  return (
    <img
      src={`/factions/${slug}.png`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      // Centred on its line: bigger than the text it sits in.
      style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6, flexShrink: 0 }}
    />
  );
}

/** A faction dropdown's option: its icon, then its label. */
export function renderFactionOption({ option }: { option: { value: string; label: string } }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <FactionIcon faction={option.value} />
      {option.label}
    </span>
  );
}
