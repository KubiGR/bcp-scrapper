import { Tooltip } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * Text with a hint shown on hover, keyboard focus or tap (a title attribute shows late or not at
 * all); screen readers get `label`, or the hint after the text.
 */
export function HoverHint({
  hint,
  label,
  children,
}: {
  hint: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip label={hint} withArrow events={{ hover: true, focus: true, touch: true }}>
      <span tabIndex={0} aria-label={label} style={{ cursor: 'help' }}>
        {children}
      </span>
    </Tooltip>
  );
}
