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
    // Several chips: the first is the rating; "?" and "+" are ignored.
    expect(cells?.[1]?.[4]).toBe('G');
    expect(cells?.[3]?.[0]).toBe('G');
    expect(cells?.[4]?.[4]).toBe('BOUYA');
    expect(unreadable).toEqual([]);
  });

  it('keeps a second chip as what the game can become; modifiers are not chips', () => {
    const text = Array.from({ length: 5 }, () =>
      row('Y, R', 'G, ?', 'G, A, GG', 'GG', 'R, Y, G'),
    ).join('\n');
    const { cells, alts } = parseSheetPaste(text);
    expect(cells?.[0]).toEqual(['Y', 'G', 'G', 'GG', 'R']);
    expect(alts?.[0]).toEqual(['R', null, 'GG', null, 'Y']);
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

  it('ignores the preferred-layout badges A, B and C', () => {
    const text = Array.from({ length: 5 }, () => row('G, A', 'B, Y', 'C', 'R, A, ?', 'G')).join(
      '\n',
    );
    const { cells, unreadable } = parseSheetPaste(text);
    expect(cells?.[0]).toEqual(['G', 'Y', null, 'R', 'G']);
    expect(unreadable).toEqual([]);
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

  it('reads each side’s army, the opponents’ names and lists from around the block', () => {
    // As Google Sheets copies A1:I11: the list cells span lines, so they come quoted.
    const text = [
      row('', '', '', '', 'George', 'Ioannis', 'John', 'Panagiotis', 'Petros'),
      row(
        'PAIRING MATRIX',
        '',
        '',
        '',
        'Grey Knights',
        'Death Guard',
        'Orks',
        'Chaos Space Marines',
        'Adeptus Custodes',
      ),
      row(
        '',
        '',
        '',
        '',
        'Argent Assault + Banishers',
        'Contagion Engines',
        'War Horde',
        'Devotees',
        'Lions of the Emperor',
      ),
      row(
        'Round',
        '',
        '',
        '',
        '"Crowe + 10 Purifiers\n5 Strike"',
        '"LoC + 3 ""Deathshroud""\nPoxwalkers"',
        '',
        '',
        '',
      ),
      row('', '', '', '', 'DRP', 'REC', 'PTF', 'PRT', 'T&H'),
      row('YOUR PLAYER', 'ROLE', 'AVERAGE', '', '11.7 ± 4', '10.6 ± 2.5', '7.9', '8.9', '10.3'),
      row('Space Marines', 'DRP', '11.4 ± 3.8', '', 'GG', 'Y', 'Y', 'R', 'G'),
      row('Emperor’s Children', 'REC', '10.1', '', 'Y', 'G', 'RR', 'G', 'G'),
      row('Chaos Daemons', 'T&H', '7.9', '', 'R', 'G', 'Y', 'R', 'RR'),
      row('World Eaters', 'PTF', '10.9', '', 'G', 'Y', 'R', 'G', 'G'),
      row('Adepta Sororitas', 'PRT', '9.1', '', 'G', 'R', 'Y', 'RR', 'BOUYA'),
    ].join('\n');
    const { cells, ours, theirs } = parseSheetPaste(text);
    expect(cells?.[0]).toEqual(['GG', 'Y', 'Y', 'R', 'G']);
    expect(ours.map((p) => p.army)).toEqual([
      'Space Marines',
      'Emperor’s Children',
      'Chaos Daemons',
      'World Eaters',
      'Adepta Sororitas',
    ]);
    // The army is the header the app recognises, even below a name or above a detachment.
    expect(theirs.map((p) => p.army)).toEqual([
      'Grey Knights',
      'Death Guard',
      'Orks',
      'Chaos Space Marines',
      'Adeptus Custodes',
    ]);
    expect(theirs[0]?.name).toBe('George');
    expect(theirs[1]?.list).toBe('LoC + 3 "Deathshroud"\nPoxwalkers');
    expect(theirs[2]?.list).toBeNull();
  });

  it('names the players by place when only the chips were copied', () => {
    const text = Array.from({ length: 5 }, () => row('G', 'G', 'G', 'G', 'G')).join('\n');
    const { ours, theirs } = parseSheetPaste(text);
    expect(ours[0]).toEqual({
      army: 'Player 1',
      name: null,
      detachment: null,
      disposition: null,
      list: null,
    });
    expect(theirs[4]).toEqual({
      army: 'Opponent 5',
      name: null,
      detachment: null,
      disposition: null,
      list: null,
    });
  });

  it('reads the sheet’s disposition codes and the detachment row for both sides', () => {
    const text = [
      row('', '', '', '', 'George', 'Ioannis', 'John', 'Panagiotis', 'Petros'),
      row(
        '',
        '',
        '',
        '',
        'Grey Knights',
        'Death Guard',
        'Orks',
        'Chaos Space Marines',
        'Adeptus Custodes',
      ),
      row(
        '',
        '',
        '',
        '',
        'Argent Assault + Banishers',
        'Contagion Engines',
        'War Horde',
        'Devotees',
        'Lions of the Emperor',
      ),
      row('', '', '', '', 'DRP', 'REC', 'PTF', 'PRT', 'T&H'),
      row('Space Marines', 'DRP', '11.4 ± 3.8', '', 'GG', 'Y', 'Y', 'R', 'G'),
      row('Emperor’s Children', 'REC', '10.1', '', 'Y', 'G', 'RR', 'G', 'G'),
      row('Chaos Daemons', 'T&H', '7.9', '', 'R', 'G', 'Y', 'R', 'RR'),
      row('World Eaters', 'PTF', '10.9', '', 'G', 'Y', 'R', 'G', 'G'),
      row('Adepta Sororitas', 'PRT', '9.1', '', 'G', 'R', 'Y', 'RR', 'BOUYA'),
    ].join('\n');
    const { ours, theirs } = parseSheetPaste(text);
    expect(ours.map((p) => p.disposition)).toEqual([
      'Disruption',
      'Reconnaissance',
      'Take and Hold',
      'Purge the Foe',
      'Priority Assets',
    ]);
    expect(theirs[0]?.disposition).toBe('Disruption');
    expect(theirs[0]?.detachment).toBe('Argent Assault + Banishers');
    expect(theirs[2]?.detachment).toBe('War Horde');
    expect(ours[0]?.detachment).toBeNull();
  });
});
