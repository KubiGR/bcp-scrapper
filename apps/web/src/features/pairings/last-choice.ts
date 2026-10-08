import { z } from 'zod';

/** The planner's choice, as in its address: event, our team, the team we play. */
export const PairingsChoiceSchema = z.object({
  event: z.string().optional(),
  team: z.string().optional(),
  opponent: z.string().optional(),
});
export type PairingsChoice = z.infer<typeof PairingsChoiceSchema>;

const KEY = 'pairings:last-choice';

/** The choice last made in this browser; empty if none or unreadable (private window, cleared). */
export function readLastChoice(): PairingsChoice {
  try {
    const parsed = PairingsChoiceSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function writeLastChoice(choice: PairingsChoice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // Storage blocked: the planner just starts empty next time.
  }
}

/** Where the planner should reopen: the remembered choice, unless the address already names an event. */
export function startChoice(search: PairingsChoice): PairingsChoice | null {
  if (search.event !== undefined) return null;
  const last = readLastChoice();
  return last.event === undefined ? null : last;
}
