import { describe, expect, it } from 'vitest';
import { exportFileName, listsToText } from './lists-export';

describe('exportFileName', () => {
  it('slugs the event name into a safe download name', () => {
    expect(exportFileName('Sample Team Open', 'txt')).toBe('sample-team-open-lists.txt');
    expect(exportFileName(`Tournoi d'Été "Quoted" / 2026`, 'json')).toBe(
      'tournoi-d-ete-quoted-2026-lists.json',
    );
    expect(exportFileName('!!!', 'txt')).toBe('event-lists.txt');
  });
});

describe('listsToText', () => {
  it('writes a header and one titled block per list, in the given order', () => {
    const text = listsToText('Sample Team Open', [
      {
        placing: 1,
        player: 'Finn Ford',
        team: 'Charlie Wing',
        faction: 'Orks',
        listId: 'L1',
        text: 'Warboss',
      },
      { placing: null, player: 'Hal Hayes', team: null, faction: null, listId: 'L2', text: null },
    ]);
    expect(text).toContain('Sample Team Open\n2 army lists');
    expect(text).toContain('#1 · Finn Ford · Charlie Wing · Orks\n');
    expect(text).toContain('Warboss');
    expect(text).toContain('Hal Hayes\n');
    expect(text).toContain('(empty list)');
    expect(text.indexOf('Finn Ford')).toBeLessThan(text.indexOf('Hal Hayes'));
  });
});
