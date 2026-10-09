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
