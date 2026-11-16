import { useEffect } from 'react';

export const SITE_TITLE = 'Logis';

type Part = string | null | undefined | false;

/** The parts that say something, joined: "Genestealer Cult · X-1 · Top lists". */
export const joinParts = (parts: readonly Part[]): string =>
  parts
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' · ');

/**
 * The tab's title: the admin to-do count, then the page with what it shows, most specific first so
 * it survives a narrow tab ("(2) Genestealer Cult · X-1 · Top lists"). The site's name only stands
 * in for a page that names none: the tab's icon already says it's Logis.
 */
export function composeTitle(page: string, count: number): string {
  const title = page === '' ? SITE_TITLE : page;
  return count > 0 ? `(${String(count)}) ${title}` : title;
}

// One page and one count at a time: the open page sets the one, the admin to-do the other.
let pageTitle = '';
let todoCount = 0;
const apply = () => {
  document.title = composeTitle(pageTitle, todoCount);
};

/** Names the open page in the tab, and what it's showing; empty parts are skipped. */
export function usePageTitle(...parts: Part[]) {
  const page = joinParts(parts);
  useEffect(() => {
    pageTitle = page;
    apply();
    return () => {
      // The next page sets its own; this only clears a page that left without one.
      if (pageTitle === page) {
        pageTitle = '';
        apply();
      }
    };
  }, [page]);
}

/** The admin to-do count in front of the title, so it's seen from another tab. */
export function useTitleCount(count: number) {
  useEffect(() => {
    todoCount = count;
    apply();
  }, [count]);
}

/** A list from the address, for a title: "Orks, Tyranids". */
export const listed = (value: string | undefined, separator = ','): string | undefined => {
  const items = value?.split(separator).filter(Boolean) ?? [];
  return items.length > 0 ? items.join(', ') : undefined;
};
