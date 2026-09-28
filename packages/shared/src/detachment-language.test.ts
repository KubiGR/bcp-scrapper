import { describe, expect, it } from 'vitest';
import { looksForeign } from './detachment-language';

describe('looksForeign', () => {
  it.each([
    'Cabalgata del Caos',
    'Main de la Dynastie',
    'Armería del Faerón',
    'Pantheon of Woe和王朝之手',
    'Brigada Datake y Loz Bravukonez',
    'Masas de xenocultistas',
    'Depredadores en emboscada',
    'Bastiones de la tiranía',
    'Héroes del alzamiento',
    'Scriptorium-Konklave und Kriegshaufen',
  ])('flags %s', (name) => {
    expect(looksForeign(name)).toBe(true);
  });

  it.each([
    'Wreckas',
    'Cursed Legion & Skyshroud Spearhead',
    "Forgefather's Seekers",
    'Rage‑Cursed Onslaught',
    'Rollin’ Deff and Speedwaaagh!',
    'BiosancticÂ Broodsurge',
    'Carnival of Excess(2dp)',
    'Legends of Saga and Song',
    'Do or Die',
  ])('keeps %s as English', (name) => {
    expect(looksForeign(name)).toBe(false);
  });
});
