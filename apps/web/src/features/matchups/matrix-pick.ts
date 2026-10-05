/** A clicked matrix cell; `detachment` when it's in a faction's detachment row (null: no list). */
export interface MatrixPick {
  row: string;
  col: string;
  detachment?: string | null;
}

export const UNKNOWN_DETACHMENT = 'Detachment unknown';

/** The row side as people read it: "Orks", or "Orks · War Horde". */
export const pickLabel = ({ row, detachment }: Pick<MatrixPick, 'row' | 'detachment'>) =>
  detachment === undefined ? row : `${row} · ${detachment ?? UNKNOWN_DETACHMENT}`;
