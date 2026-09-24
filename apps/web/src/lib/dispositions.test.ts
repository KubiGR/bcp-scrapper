import { describe, expect, it } from 'vitest';
import { dispositionColor } from './dispositions';

describe('dispositionColor', () => {
  it.each([
    ['Take and Hold', 'green'],
    ['Priority Assets', 'orange'],
    ['Purge the Foe', 'red'],
    ['Reconnaissance', 'teal'],
    ['Disruption', 'grape'],
  ])('maps %s to %s', (name, color) => {
    expect(dispositionColor(name)).toBe(color);
  });

  it('matches case-insensitively and trims whitespace', () => {
    expect(dispositionColor('  take AND hold  ')).toBe('green');
    expect(dispositionColor('DISRUPTION')).toBe('grape');
  });

  it('falls back to gray for an unknown or new disposition', () => {
    expect(dispositionColor('Something New')).toBe('gray');
  });
});
