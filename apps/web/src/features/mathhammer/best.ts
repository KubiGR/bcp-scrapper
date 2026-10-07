import { calculate } from '@bcp/shared';
import { phaseProfiles, sitsOut, toCalculation, type MathhammerForm } from './form-state';
import type { Outcome } from './ResultPanel';

/** More than this many combinations: each Best weapon is chosen on its own instead. */
const MAX_COMBINATIONS = 16;

interface Tried {
  score: [number, number];
  outcome: Outcome;
}

function attempt(form: MathhammerForm, chosen: Record<string, number>): Tried | { error: string } {
  const read = toCalculation(form, chosen);
  if ('error' in read) return read;
  try {
    const result = calculate(read.calculation);
    return {
      score: [result.averages.modelsSlain, result.averages.woundsDealt],
      outcome: { result, groupNames: form.defender.groups.map((g) => g.name), best: {} },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const better = (a: [number, number], b: [number, number]) =>
  a[0] > b[0] + 1e-12 || (Math.abs(a[0] - b[0]) <= 1e-12 && a[1] > b[1] + 1e-12);

/**
 * The form's result, with each weapon set to Best using the profile that slays most models after
 * overkill against this target (then most wounds). `best` names the profiles chosen.
 */
export function calculateForm(form: MathhammerForm): Outcome {
  // Weapons with a choice in this phase: Best rows that attack, with 2+ usable profiles.
  const open = form.weapons.filter(
    (w) =>
      w.profile === 'best' && sitsOut(form, w) === null && phaseProfiles(w, form.phase).length > 1,
  );
  const names = (chosen: Record<string, number>) =>
    Object.fromEntries(
      open.map((w) => [
        w.key,
        w.profiles[chosen[w.key] ?? phaseProfiles(w, form.phase)[0] ?? 0]?.name ?? '',
      ]),
    );
  const combinations = open.reduce((n, w) => n * phaseProfiles(w, form.phase).length, 1);
  let chosen: Record<string, number> = {};
  if (combinations <= MAX_COMBINATIONS) {
    let best: { tried: Tried; chosen: Record<string, number> } | null = null;
    const walk = (index: number, picks: Record<string, number>): { error: string } | null => {
      const row = open[index];
      if (row === undefined) {
        const tried = attempt(form, picks);
        if ('error' in tried) return tried;
        if (best === null || better(tried.score, best.tried.score)) best = { tried, chosen: picks };
        return null;
      }
      for (const i of phaseProfiles(row, form.phase)) {
        const failed = walk(index + 1, { ...picks, [row.key]: i });
        if (failed !== null) return failed;
      }
      return null;
    };
    const failed = walk(0, {});
    if (failed !== null) return failed;
    const found = best as { tried: Tried; chosen: Record<string, number> } | null;
    if (found === null) return { error: 'Nothing to calculate' };
    chosen = found.chosen;
  } else {
    // Too many combinations: settle each Best weapon in turn, the others as chosen so far.
    for (const row of open) {
      let top: { score: [number, number]; index: number } | null = null;
      for (const i of phaseProfiles(row, form.phase)) {
        const tried = attempt(form, { ...chosen, [row.key]: i });
        if ('error' in tried) return tried;
        if (top === null || better(tried.score, top.score)) top = { score: tried.score, index: i };
      }
      chosen = { ...chosen, [row.key]: top?.index ?? 0 };
    }
  }
  const final = attempt(form, chosen);
  if ('error' in final) return final;
  return { ...final.outcome, best: names(chosen) };
}
