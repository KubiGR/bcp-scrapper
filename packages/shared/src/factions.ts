/** Allegiances BCP (or a list) may give instead of an army, lower-case. Never an army. */
export const ALLEGIANCE_NAMES = [
  'Imperium',
  'Chaos',
  'Xenos',
  'Forces of the Imperium',
  'Forces of Chaos',
  'Forces of Xenos',
  'Forces of the Hive Mind',
].map((name) => name.toLowerCase());
const ALLEGIANCES = new Set(ALLEGIANCE_NAMES);

/** Allegiances a player can pick on BCP instead of an army; not factions. */
export function isAllegiance(faction: string): boolean {
  return ALLEGIANCES.has(faction.trim().toLowerCase());
}

/**
 * BCP's faction, or the army read from the player's list (a guess) when BCP has none or only an
 * allegiance.
 */
export function resolveFaction(
  bcpFaction: string | null,
  parsedArmy: string | null,
): { faction: string | null; factionGuessed: boolean } {
  const vague = bcpFaction === null || isAllegiance(bcpFaction);
  // A list that only names an allegiance says no more than BCP does.
  if (vague && parsedArmy !== null && !isAllegiance(parsedArmy))
    return { faction: parsedArmy, factionGuessed: true };
  return { faction: bcpFaction, factionGuessed: false };
}

/**
 * The faction a player counts under in the analysis: `resolveFaction`, except that an allegiance
 * left over (BCP had only "Xenos" and no readable list says more) is no faction at all (null).
 */
export function countedFaction(
  bcpFaction: string | null,
  parsedArmy: string | null,
): { faction: string | null; factionGuessed: boolean } {
  const resolved = resolveFaction(bcpFaction, parsedArmy);
  return resolved.faction !== null && isAllegiance(resolved.faction)
    ? { faction: null, factionGuessed: false }
    : resolved;
}

/** BCP's faction names (10th edition), as players' factions are stored. */
export const BCP_FACTIONS = [
  'Adepta Sororitas',
  'Adeptus Custodes',
  'Adeptus Mechanicus',
  'Aeldari',
  'Astra Militarum',
  'Black Templars',
  'Blood Angels',
  'Chaos Daemons',
  'Chaos Knights',
  'Chaos Space Marines',
  'Dark Angels',
  'Death Guard',
  'Deathwatch',
  'Drukhari',
  "Emperor's Children",
  'Genestealer Cult',
  'Grey Knights',
  'Imperial Agents',
  'Imperial Knights',
  'Leagues of Votann',
  'Necrons',
  'Orks',
  'Space Marines (Astartes)',
  'Space Wolves',
  "T'au Empire",
  'Thousand Sons',
  'Tyranids',
  'World Eaters',
] as const;

const SPACE_MARINES = 'Space Marines (Astartes)';

/**
 * Other names armies go by in lists: GW-app wording, chapters BCP counts as Space Marines, and
 * the Spanish, German, French and Italian GW app. Keys are normalised (see `normalise`).
 */
const ALIASES: Record<string, (typeof BCP_FACTIONS)[number]> = {
  // English variants
  'space marines': SPACE_MARINES,
  'adeptus astartes': SPACE_MARINES,
  'genestealer cults': 'Genestealer Cult',
  'tau empire': "T'au Empire",
  "t'au": "T'au Empire",
  'heretic astartes': 'Chaos Space Marines',
  daemons: 'Chaos Daemons',
  'legiones daemonica': 'Chaos Daemons',
  votann: 'Leagues of Votann',
  // Chapters without a BCP faction of their own
  ultramarines: SPACE_MARINES,
  'imperial fists': SPACE_MARINES,
  'iron hands': SPACE_MARINES,
  'raven guard': SPACE_MARINES,
  salamanders: SPACE_MARINES,
  'white scars': SPACE_MARINES,
  'crimson fists': SPACE_MARINES,
  // Spanish
  'marines espaciales': SPACE_MARINES,
  'angeles oscuros': 'Dark Angels',
  'angeles sangrientos': 'Blood Angels',
  'lobos espaciales': 'Space Wolves',
  'templarios negros': 'Black Templars',
  'caballeros grises': 'Grey Knights',
  'guardia de la muerte': 'Death Guard',
  'mil hijos': 'Thousand Sons',
  'devoradores de mundos': 'World Eaters',
  'marines espaciales del caos': 'Chaos Space Marines',
  'astartes herejes': 'Chaos Space Marines',
  'legiones daemonicas': 'Chaos Daemons',
  'caballeros del caos': 'Chaos Knights',
  'caballeros imperiales': 'Imperial Knights',
  'hijos del emperador': "Emperor's Children",
  orkos: 'Orks',
  necrones: 'Necrons',
  tiranidos: 'Tyranids',
  'cultos genestealer': 'Genestealer Cult',
  "imperio t'au": "T'au Empire",
  'ligas de los votann': 'Leagues of Votann',
  'agentes imperiales': 'Imperial Agents',
  // German
  'konglomerate der votann': 'Leagues of Votann',
  tyraniden: 'Tyranids',
  chaosdamonen: 'Chaos Daemons',
  'chaos-space-marines': 'Chaos Space Marines',
  'imperiale ritter': 'Imperial Knights',
  'chaos-ritter': 'Chaos Knights',
  symbiontenkulte: 'Genestealer Cult',
  'imperiale agenten': 'Imperial Agents',
  'kinder des imperators': "Emperor's Children",
  // French
  tyranides: 'Tyranids',
  'demons du chaos': 'Chaos Daemons',
  'space marines du chaos': 'Chaos Space Marines',
  'chevaliers imperiaux': 'Imperial Knights',
  'chevaliers du chaos': 'Chaos Knights',
  'cultes genestealers': 'Genestealer Cult',
  "empire t'au": "T'au Empire",
  'ligues de votann': 'Leagues of Votann',
  'agents imperiaux': 'Imperial Agents',
  "enfants de l'empereur": "Emperor's Children",
  // Italian
  tiranidi: 'Tyranids',
  'legioni demoniache': 'Chaos Daemons',
  'cavalieri imperiali': 'Imperial Knights',
  'space marine del caos': 'Chaos Space Marines',
};

/** Lower case, no accents, straight apostrophes, single spaces. */
const normalise = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const BY_NAME = new Map<string, string>([
  ...BCP_FACTIONS.map((faction) => [normalise(faction), faction] as const),
  ...Object.entries(ALIASES),
]);

/**
 * BCP's faction name for an army named in a list (any known wording or language), or null when
 * the name isn't a faction at all: a list's army is only used when it's recognised.
 */
export function canonicalArmy(name: string): string | null {
  return BY_NAME.get(normalise(name)) ?? null;
}

/**
 * Detachment names from the Spanish/German GW app, as written there, and their English names.
 * Only names whose translation is certain; add more as they turn up.
 */
export const DETACHMENT_TRANSLATIONS: Readonly<Record<string, string>> = {
  'Die Macht der Moritoi': 'Might of the Moritoi',
  'Poderío de los Moritoi': 'Might of the Moritoi',
  'Martillazo de los Tharanatoi': 'Tharanatoi Hammerblow',
  'Cónclave del Librarius': 'Librarius Conclave',
  'Espolones de la Reina Norn': 'Talons of the Norn Queen',
  'Señores de la Forja': 'Lords of the Forge',
  'Hueste frenética': 'Frenzied Host',
  'Senda del proscrito': 'Path of the Outcast',
  'Incursores de Huron': "Huron's Marauders",
  'Exhibición y matanza': 'Exhibition of Slaughter',
  'Hueste guerrera acorazada': 'Armoured Warhost',
  'Cábala del Caos': 'Cabal of Chaos',
};

const DETACHMENT_BY_NAME = new Map(
  Object.entries(DETACHMENT_TRANSLATIONS).map(([name, english]) => [normalise(name), english]),
);

/** The English name of a detachment written in another language, or the name as given. */
export function canonicalDetachment(name: string): string {
  return DETACHMENT_BY_NAME.get(normalise(name)) ?? name;
}
