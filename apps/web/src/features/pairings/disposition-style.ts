/** The team sheet's codes and colours for the five dispositions. */
export const DISPOSITIONS: Readonly<
  Record<string, { code: string; background: string; color: string }>
> = {
  Disruption: { code: 'DRP', background: '#1155cc', color: '#fff' },
  Reconnaissance: { code: 'REC', background: '#00e5e5', color: '#111' },
  'Purge the Foe': { code: 'PTF', background: '#e00000', color: '#fff' },
  'Priority Assets': { code: 'PRT', background: '#f1a800', color: '#111' },
  'Take and Hold': { code: 'T&H', background: '#38761d', color: '#fff' },
};

const ORDER = Object.keys(DISPOSITIONS);

/** Players grouped by disposition in the sheet's order (both sides alike); none last; ties kept. */
export function byDisposition<T extends { disposition?: string | null }>(players: T[]): T[] {
  const rank = (p: T) => {
    const at = p.disposition ? ORDER.indexOf(p.disposition) : -1;
    return at === -1 ? ORDER.length : at;
  };
  return players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => p);
}
