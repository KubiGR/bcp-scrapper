import { solveMatrixGame, type PairingAnalysis } from '@bcp/shared';

/** The round-1 defender picture, as the Summary and the grid show it. */
export interface DefenderView {
  /** Expected team score (of 100). */
  value: number;
  /** Our mix over our defenders. */
  ourDefender: number[];
  /** Their likely defender, by place (0 for the ones ruled out). */
  theirDefender: number[];
  /** Our defender with the best worst case over their defenders left. */
  safeDefender: { index: number; worst: number };
}

/**
 * The defender game with their defenders in `ruledOut` (by place) left out: solved again among the
 * ones left, so their likely defender and our best mix follow the read.
 */
export function withRuledOut(
  analysis: PairingAnalysis,
  ruledOut: ReadonlySet<number>,
): DefenderView {
  if (ruledOut.size === 0) {
    return {
      value: analysis.value,
      ourDefender: analysis.ourDefender,
      theirDefender: analysis.theirDefender,
      safeDefender: analysis.safeDefender,
    };
  }
  const grid = analysis.defenderGrid;
  const kept = (grid[0] ?? []).map((_, e) => e).filter((e) => !ruledOut.has(e));
  const game = solveMatrixGame(grid.map((row) => kept.map((e) => row[e] ?? 0)));
  const theirDefender = (grid[0] ?? []).map((_, e) => {
    const at = kept.indexOf(e);
    return at === -1 ? 0 : (game.cols[at] ?? 0);
  });
  const worst = grid.map((row) => Math.min(...kept.map((e) => row[e] ?? 0)));
  const best = Math.max(...worst);
  return {
    value: game.value,
    ourDefender: game.rows,
    theirDefender,
    safeDefender: { index: worst.indexOf(best), worst: best },
  };
}
