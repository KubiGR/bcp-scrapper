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
    expect(text.startsWith("Sample Team Open\n2 of 2 players' army lists\n\n")).toBe(true);
    expect(text).toContain('#1 · Finn Ford · Charlie Wing · Orks\n');
    expect(text).toContain('Warboss');
    expect(text).toContain('Hal Hayes\n');
    expect(text).toContain('(empty list)');
    expect(text.indexOf('Finn Ford')).toBeLessThan(text.indexOf('Hal Hayes'));
  });

  it('names the players whose list is missing', () => {
    const text = listsToText(
      'Sample Team Open',
      [
        {
          placing: 1,
          player: 'Finn Ford',
          team: null,
          faction: null,
          listId: 'L1',
          text: 'Warboss',
        },
      ],
      [
        { player: 'Ada Archer', team: 'Alpha Squad', reason: 'not fetched' },
        { player: 'Hal Hayes', team: null, reason: 'no list on BCP' },
      ],
    );
    expect(
      text.startsWith(
        "Sample Team Open\n1 of 3 players' army lists\nMissing: Ada Archer, Hal Hayes\n\n",
      ),
    ).toBe(true);
  });
});
