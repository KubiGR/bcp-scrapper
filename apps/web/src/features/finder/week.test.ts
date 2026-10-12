import { describe, expect, it } from 'vitest';
import { weekOf } from './week';

describe('weekOf', () => {
  it('names the Monday-to-Sunday week (UTC) an event starts in', () => {
    // Friday 10 and Sunday 12 April 2026 share the week of Monday 6 April.
    expect(weekOf('2026-04-10T08:00:00.000Z')).toEqual({
      key: '2026-04-06',
      label: 'Week of 6–12 Apr',
    });
    expect(weekOf('2026-04-12T23:30:00.000Z').key).toBe('2026-04-06');
    expect(weekOf('2026-04-13T00:00:00.000Z').key).toBe('2026-04-13');
  });

  it('spans two months when the week does', () => {
    expect(weekOf('2026-03-31T10:00:00.000Z').label).toBe('Week of 30 Mar – 5 Apr');
  });
});
