import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react';
import classes from './FactionMatrix.module.css';

export interface CellTipHandle {
  /** Shows `label` above `target`. */
  show: (label: string, target: Element) => void;
  hide: () => void;
}

/**
 * One tooltip for the whole matrix, moved to the hovered cell: hundreds of cells, each with its
 * own tooltip, would slow the table down.
 */
export function CellTip({ ref }: { ref: Ref<CellTipHandle> }) {
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null);
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
        setTip({ label, x: cell.left + cell.width / 2, y: cell.top });
      },
      hide: () => {
        setTip(null);
      },
    }),
    [],
  );
  if (tip === null) return null;
  return (
    <div ref={box} role="tooltip" className={classes.tip} style={{ left: tip.x, top: tip.y }}>
      {tip.label}
    </div>
  );
}
