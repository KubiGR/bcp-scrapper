import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { composeTitle, joinParts, listed, usePageTitle, useTitleCount } from './page-title';

describe('page titles', () => {
  it('puts what the page shows first, skips empty parts, and the count in front', () => {
    expect(joinParts(['Orks, Tyranids', undefined, '', false, 'X-1', 'Top lists'])).toBe(
      'Orks, Tyranids · X-1 · Top lists',
    );
    expect(composeTitle('Top lists', 0)).toBe('Top lists');
    expect(composeTitle('', 2)).toBe('(2) Logis');
    expect(listed('Orks|Tyranids', '|')).toBe('Orks, Tyranids');
    expect(listed(undefined)).toBeUndefined();
  });

  it('names the open page in the tab, keeps the count, and goes back to the site on leaving', () => {
    const count = renderHook(
      ({ n }) => {
        useTitleCount(n);
      },
      { initialProps: { n: 0 } },
    );
    const page = renderHook(
      ({ parts }) => {
        usePageTitle(...parts);
      },
      {
        initialProps: { parts: ['Top lists'] },
      },
    );
    expect(document.title).toBe('Top lists');
    page.rerender({ parts: ['Genestealer Cult', 'X-1', 'Top lists'] });
    count.rerender({ n: 3 });
    expect(document.title).toBe('(3) Genestealer Cult · X-1 · Top lists');
    page.unmount();
    expect(document.title).toBe('(3) Logis');
    count.rerender({ n: 0 });
    expect(document.title).toBe('Logis');
  });
});
