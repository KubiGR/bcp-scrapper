import { describe, expect, it } from 'vitest';
import { parseSheetPaste } from './sheet-paste';

const row = (...cells: string[]) => cells.join('\t');

describe('parseSheetPaste', () => {
  it('reads a copied 5 x 5 block of chips', () => {
    const text = [
      row('GG', 'Y', 'Y', 'R', 'G'),
      row('Y', 'G', 'RR', 'G', 'G, Y'),
      row('R', 'G', 'Y', 'R', 'RR'),
      row('G, ?', 'Y', 'R', 'G', 'G, Y'),
      row('G', 'R', 'Y', 'RR', 'BOUYA'),
    ].join('\n');
    const { cells, unreadable } = parseSheetPaste(text);
    expect(cells?.[0]).toEqual(['GG', 'Y', 'Y', 'R', 'G']);
    // Several chips: the first colour chip; "?" and "+" are ignored.
    expect(cells?.[1]?.[4]).toBe('G');
    expect(cells?.[3]?.[0]).toBe('G');
    expect(cells?.[4]?.[4]).toBe('BOUYA');
    expect(unreadable).toEqual([]);
  });

  it('finds the block inside extra rows and columns, and keeps blanks unrated', () => {
    const text = [
      row('PAIRING MATRIX', '', '', '', '', '', ''),
      row('YOUR PLAYER', 'ROLE', 'Grey Knights', 'Death Guard', 'Orks', 'CSM', 'Custodes'),
      row('Space Marines', 'DRP', 'GG', 'Y', 'Y', '', 'G'),
      row('EC', 'REC', 'Y', 'G', 'RR', 'G', 'g, y'),
      row('Daemons', 'T&H', 'R', 'G', 'Y', 'R', 'RR'),
      row('WE', 'PTF', 'G', 'Y', 'R', 'G', 'G'),
      row('Sisters', 'PRT', 'G', 'R', 'Y', 'RR', 'G'),
    ].join('\r\n');
    const { cells } = parseSheetPaste(text);
    expect(cells?.[0]).toEqual(['GG', 'Y', 'Y', null, 'G']);
    expect(cells?.[1]?.[4]).toBe('G');
    expect(cells?.[4]).toEqual(['G', 'R', 'Y', 'RR', 'G']);
  });

  it('marks cells it cannot read', () => {
    const text = [
      row('GG', 'Y', 'Y', 'R', 'G'),
      row('Y', 'great', 'RR', 'G', 'G'),
      row('R', 'G', 'Y', 'R', 'RR'),
      row('G', 'Y', 'R', 'G', 'G'),
      row('G', 'R', 'Y', 'RR', 'G'),
    ].join('\n');
    const { cells, unreadable } = parseSheetPaste(text);
    expect(cells?.[1]?.[1]).toBeNull();
    expect(unreadable).toEqual([[1, 1]]);
  });

  it('gives no block when nothing pasted looks like chips', () => {
    expect(parseSheetPaste('hello\tworld').cells).toBeNull();
    expect(parseSheetPaste('').cells).toBeNull();
  });
});
