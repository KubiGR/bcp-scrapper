import { Tooltip } from '@mantine/core';
import { useRef, useState, type ReactNode } from 'react';

/**
 * One line of text that ends in "…" when it doesn't fit; hovering it then shows the whole text in
 * a tooltip (text that fits gets none).
 */
export function Clipped({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  return (
    <Tooltip label={children} disabled={!cut} openDelay={150} multiline maw={320} withinPortal>
      <span
        ref={ref}
        className={className}
        style={{
          display: 'block',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={() => {
          const el = ref.current;
          setCut(el !== null && el.scrollWidth > el.clientWidth);
        }}
      >
        {children}
      </span>
    </Tooltip>
  );
}
