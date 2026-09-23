/** Keys that identify or describe people; dropped entirely from recordings. */
const DROPPED_KEYS = new Set([
  'email',
  'username',
  'phone',
  'owner',
  'ownerFirstName',
  'ownerLastName',
  'eventUsers',
  'captain',
  'description',
]);

/** Objects under these keys are teams, so their `name` is a team name. */
const TEAM_OBJECT_KEYS = new Set(['team', 'teamPlayer1', 'teamPlayer2']);

/** `firstName`, `lastName`, and metaData's `p1-firstName` / `p2-lastName` variants. */
const NAME_KEY = /^(p[12]-)?(firstName|lastName)$/;
const LABEL_KEY = /^lbl-player[12]$/;

type AliasKind = 'person' | 'team';

/**
 * Replaces player and team names in BCP JSON with stable pseudonyms ("Player 007",
 * "Team 012"), so recorded fixtures keep their structure but identify nobody.
 */
export class Anonymiser {
  readonly #aliases = new Map<string, string>();
  readonly #counters: Record<AliasKind, number> = { person: 0, team: 0 };

  anonymise(value: unknown, parentKey = ''): unknown {
    if (Array.isArray(value)) return value.map((item) => this.anonymise(item, parentKey));
    if (value === null || typeof value !== 'object') return value;

    const owner = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(owner)) {
      if (DROPPED_KEYS.has(key)) continue;
      result[key] =
        typeof child === 'string'
          ? this.#anonymiseString(owner, key, child, parentKey)
          : this.anonymise(child, key);
    }
    return result;
  }

  #anonymiseString(owner: Record<string, unknown>, key: string, value: string, parentKey: string) {
    const nameMatch = NAME_KEY.exec(key);
    if (nameMatch) {
      const prefix = nameMatch[1] ?? '';
      const fullName = [owner[`${prefix}firstName`], owner[`${prefix}lastName`]]
        .filter((part): part is string => typeof part === 'string')
        .join(' ');
      return nameMatch[2] === 'firstName' ? 'Player' : this.#alias('person', fullName);
    }
    if (LABEL_KEY.test(key)) return `Player ${this.#alias('person', value)}`;
    if (key === 'name' && (TEAM_OBJECT_KEYS.has(parentKey) || 'captainId' in owner)) {
      return `Team ${this.#alias('team', value)}`;
    }
    // Some endpoints give a player's team as a plain string.
    if (key === 'team') return `Team ${this.#alias('team', value)}`;
    return value;
  }

  #alias(kind: AliasKind, realName: string): string {
    const key = `${kind}:${realName.trim().toLowerCase()}`;
    let alias = this.#aliases.get(key);
    if (alias === undefined) {
      this.#counters[kind] += 1;
      alias = String(this.#counters[kind]).padStart(3, '0');
      this.#aliases.set(key, alias);
    }
    return alias;
  }
}
