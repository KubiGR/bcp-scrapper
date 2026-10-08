export interface GameSolution {
  /** The game's value for the row player. */
  value: number;
  /** Row player's optimal mixed strategy. */
  rows: number[];
  /** Column player's optimal mixed strategy. */
  cols: number[];
}

const EPS = 1e-12;

/**
 * Solves a zero-sum matrix game exactly; rows maximise. The classic reduction: shift every entry
 * positive, then the column player's LP max Σy s.t. B·y ≤ 1 by the simplex method; the row
 * player's strategy is the dual.
 */
export function solveMatrixGame(a: number[][]): GameSolution {
  const m = a.length;
  const n = a[0]?.length ?? 0;
  if (m === 0 || n === 0) throw new Error('A game needs at least one row and one column');
  const shift = 1 - Math.min(...a.flat());
  const width = n + m + 1;
  const t: number[][] = a.map((row, i) => {
    const r = new Array<number>(width).fill(0);
    row.forEach((v, j) => (r[j] = v + shift));
    r[n + i] = 1;
    r[width - 1] = 1;
    return r;
  });
  let obj = new Array<number>(width).fill(0);
  for (let j = 0; j < n; j += 1) obj[j] = -1;
  const basis = Array.from({ length: m }, (_, i) => n + i);
  for (;;) {
    let col = -1;
    let most = -EPS;
    for (let j = 0; j < n + m; j += 1) {
      const v = obj[j] ?? 0;
      if (v < most) {
        most = v;
        col = j;
      }
    }
    if (col < 0) break;
    let row = -1;
    let ratio = Infinity;
    for (let i = 0; i < m; i += 1) {
      const v = t[i]?.[col] ?? 0;
      if (v > EPS) {
        const r = (t[i]?.[width - 1] ?? 0) / v;
        if (r < ratio - EPS) {
          ratio = r;
          row = i;
        }
      }
    }
    if (row < 0) throw new Error('Unbounded game');
    const pivotRow = t[row] ?? [];
    const pivot = pivotRow[col] ?? 1;
    const scaled = pivotRow.map((v) => v / pivot);
    t[row] = scaled;
    for (let i = 0; i < m; i += 1) {
      if (i === row) continue;
      const r = t[i] ?? [];
      const f = r[col] ?? 0;
      if (Math.abs(f) > 1e-15) t[i] = r.map((v, k) => v - f * (scaled[k] ?? 0));
    }
    const f = obj[col] ?? 0;
    obj = obj.map((v, k) => v - f * (scaled[k] ?? 0));
    basis[row] = col;
  }
  const total = obj[width - 1] ?? 1;
  const cols = new Array<number>(n).fill(0);
  basis.forEach((b, i) => {
    if (b < n) cols[b] = (t[i]?.[width - 1] ?? 0) / total;
  });
  const rows = Array.from({ length: m }, (_, i) => (obj[n + i] ?? 0) / total);
  // Rounding can leave -1e-17 where a strategy is never played: show it as 0.
  const clean = (xs: number[]) => xs.map((x) => (x < 0 ? 0 : x));
  return { value: 1 / total - shift, rows: clean(rows), cols: clean(cols) };
}
