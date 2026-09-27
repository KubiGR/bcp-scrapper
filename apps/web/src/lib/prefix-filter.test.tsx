import { MultiSelect } from '@mantine/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { rankByPrefix } from './prefix-filter';

const FACTIONS = [
  'Genestealer Cults',
  'Necrons',
  'Adeptus Mechanicus',
  'Dark Angels',
  'Knights of Nemesis',
];

describe('rankByPrefix', () => {
  it('puts names starting with the text first, then a word starting with it, then the rest', () => {
    expect(rankByPrefix(FACTIONS, 'ne')).toEqual([
      'Necrons',
      'Knights of Nemesis',
      'Genestealer Cults',
    ]);
  });

  it('ignores case and surrounding spaces, and keeps every option for an empty search', () => {
    expect(rankByPrefix(FACTIONS, '  DARK ')).toEqual(['Dark Angels']);
    expect(rankByPrefix(FACTIONS, '')).toEqual(FACTIONS);
  });

  it('keeps the original order within a rank', () => {
    expect(rankByPrefix(['Orks', 'Orkos', 'Space Orks'], 'ork')).toEqual([
      'Orks',
      'Orkos',
      'Space Orks',
    ]);
  });
});

describe('searchable selects (theme default)', () => {
  it('shows names starting with the typed letters first', async () => {
    renderWithProviders(<MultiSelect aria-label="Faction" data={FACTIONS} searchable />);
    const input = screen.getByRole('combobox', { name: 'Faction' });
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'ne' } });
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Necrons',
      'Knights of Nemesis',
      'Genestealer Cults',
    ]);
  });
});
