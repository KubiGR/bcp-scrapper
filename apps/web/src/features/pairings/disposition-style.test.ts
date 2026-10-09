import { describe, expect, it } from 'vitest';
import { byDisposition } from './disposition-style';

const p = (id: string, disposition: string | null) => ({
  id,
  name: id,
  faction: id,
  detachments: [],
  list: null,
  disposition,
});

describe('byDisposition', () => {
  it('groups players in the sheet’s order (DRP, REC, PTF, PRT, T&H), unknown last, ties as they were', () => {
    const players = [
      p('a', 'Take and Hold'),
      p('b', null),
      p('c', 'Reconnaissance'),
      p('d', 'Disruption'),
      p('e', 'Reconnaissance'),
      p('f', 'Purge the Foe'),
    ];
    expect(byDisposition(players).map((x) => x.id)).toEqual(['d', 'c', 'e', 'f', 'a', 'b']);
  });
});
