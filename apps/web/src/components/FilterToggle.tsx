import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { ReactNode } from 'react';
import classes from './FilterToggle.module.css';

interface FilterToggleProps {
  /** How many filters are in use, shown on the button. */
  active: number;
  children: ReactNode;
}

/**
 * On phones, a "Filters" button that shows and hides the filters, so the results come first; from
 * tablet width up the filters always show and the button doesn't. Pure CSS, so the filters render
 * once and keep their state.
 */
export function FilterToggle({ active, children }: FilterToggleProps) {
  const [open, toggle] = useDisclosure(false);
  return (
    <>
      <Button
        variant="default"
        size="sm"
        hiddenFrom="sm"
        aria-expanded={open}
        onClick={toggle.toggle}
        className={classes.toggle}
      >
        {active > 0 ? `Filters (${String(active)})` : 'Filters'}
      </Button>
      <div className={classes.filters} data-open={open || undefined}>
        {children}
      </div>
    </>
  );
}
