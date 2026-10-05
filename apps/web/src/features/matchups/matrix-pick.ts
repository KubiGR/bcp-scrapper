/** A clicked matrix cell; `detachment` when it's in a faction's detachment row. */
export interface MatrixPick {
  row: string;
  col: string;
  detachment?: string;
}

/** The row side as people read it: "Orks", or "Orks · War Horde". */
export const pickLabel = ({ row, detachment }: Pick<MatrixPick, 'row' | 'detachment'>) =>
  detachment === undefined ? row : `${row} · ${detachment}`;
