import type {
  ComboboxItem,
  ComboboxParsedItem,
  ComboboxParsedItemGroup,
  OptionsFilter,
} from '@mantine/core';

/** 0: the name starts with the text; 1: a later word does; 2: it's somewhere inside; null: no match. */
function rankOf(label: string, needle: string): number | null {
  const name = label.toLocaleLowerCase();
  if (name.startsWith(needle)) return 0;
  if (name.split(/[\s\-/(]+/).some((word) => word.startsWith(needle))) return 1;
  return name.includes(needle) ? 2 : null;
}

/**
 * Labels matching the search, those starting with it first ("ne" → Necrons before Genestealer
 * Cults), then those with a word starting with it, then the rest; stable within each rank.
 */
export function rankByPrefix(labels: string[], search: string): string[] {
  return rankItems(
    labels.map((label) => ({ value: label, label })),
    search,
  ).map((item) => item.label);
}

function rankItems<T extends ComboboxItem>(items: T[], search: string): T[] {
  const needle = search.trim().toLocaleLowerCase();
  if (needle === '') return items;
  return items
    .flatMap((item, index) => {
      const rank = rankOf(item.label, needle);
      return rank === null ? [] : [{ item, rank, index }];
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

const isGroup = (item: ComboboxParsedItem): item is ComboboxParsedItemGroup => 'group' in item;

/** Mantine's `filter` for every searchable Select/MultiSelect (set in the theme). */
export const prefixFilter: OptionsFilter = ({ options, search, limit }) => {
  const ranked: ComboboxParsedItem[] = [];
  const flat: ComboboxItem[] = [];
  for (const option of options) {
    if (isGroup(option)) {
      const items = rankItems(option.items, search);
      if (items.length > 0) ranked.push({ group: option.group, items });
    } else {
      flat.push(option);
    }
  }
  return [...rankItems(flat, search), ...ranked].slice(0, limit);
};
