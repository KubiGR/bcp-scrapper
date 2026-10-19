import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import classes from './FactionMatrix.module.css';

export interface CellTipHandle {
  /** Shows `label` above `target`, or below it when the sticky headings would cover it. */
  show: (label: string, target: Element) => void;
  hide: () => void;
}

/** Height a tip needs above its cell. */
const TIP_ROOM = 36;

/**
 * One tooltip for the whole matrix, moved to the hovered cell: hundreds of cells, each with its
 * own tooltip, would slow the table down.
 */
export function CellTip({ ref }: { ref: Ref<CellTipHandle> }) {
  const [tip, setTip] = useState<{
    label: string;
    x: number;
    y: number;
    placement: 'above' | 'below';
  } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Centred over the cell, but kept inside the window at the table's edges.
  useLayoutEffect(() => {
    const el = box.current;
    if (tip === null || el === null) return;
    const half = el.offsetWidth / 2 + 8;
    el.style.left = `${String(Math.min(Math.max(tip.x, half), window.innerWidth - half))}px`;
  }, [tip]);
  useImperativeHandle(
    ref,
    () => ({
      show: (label, target) => {
        const cell = target.getBoundingClientRect();
        // The table's headings stick to the top: a tip above a cell just under them hides there.
        const headings = target.closest('table')?.querySelector('thead')?.getBoundingClientRect();
        const below = headings !== undefined && cell.top - TIP_ROOM < headings.bottom;
        setTip({
          label,
          x: cell.left + cell.width / 2,
          y: below ? cell.bottom : cell.top,
          placement: below ? 'below' : 'above',
        });
      },
      hide: () => {
        setTip(null);
      },
    }),
    [],
  );
  if (tip === null) return null;
  return (
    <div
      ref={box}
      role="tooltip"
      className={classes.tip}
      data-placement={tip.placement}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.label}
    </div>
  );
}
