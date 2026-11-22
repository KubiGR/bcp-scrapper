import { Select, type SelectProps } from '@mantine/core';
import { useState } from 'react';
import { useTypeToSearch } from '../lib/use-type-to-search';

/**
 * A searchable Select whose text clears when it's opened again, so a new search starts straight
 * away; the current choice stays as the placeholder meanwhile, and comes back if nothing new is
 * picked. On a touch screen it's a plain list (no keyboard).
 */
export function SearchSelect({
  onDropdownOpen,
  onDropdownClose,
  onSearchChange,
  placeholder,
  ...props
}: Omit<SelectProps, 'searchable' | 'searchValue'>) {
  const [search, setSearch] = useState('');
  // The choice's name while the text is cleared for a new search.
  const [hint, setHint] = useState<string | null>(null);
  const typeToSearch = useTypeToSearch();
  if (!typeToSearch) {
    return (
      <Select
        {...props}
        placeholder={placeholder}
        onDropdownOpen={onDropdownOpen}
        onDropdownClose={onDropdownClose}
      />
    );
  }
  return (
    <Select
      {...props}
      searchable
      searchValue={search}
      onSearchChange={(next) => {
        setSearch(next);
        onSearchChange?.(next);
      }}
      placeholder={hint ?? placeholder}
      onDropdownOpen={() => {
        if (search !== '') setHint(search);
        setSearch('');
        onDropdownOpen?.();
      }}
      onDropdownClose={() => {
        setHint(null);
        onDropdownClose?.();
      }}
    />
  );
}
